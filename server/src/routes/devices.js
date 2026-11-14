import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const VALID_OWNERSHIP_TYPES = new Set([
  'COMPANY_OWNED',
  'EMPLOYEE_OWNED'
]);

function cleanOptionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value).trim() || null;
}

// List registered device inventory.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM devices
       ORDER BY created_at DESC`
    );

    res.json({ devices: rows });
  } catch (err) {
    next(err);
  }
});

// Register a device inventory record.
// This does not enroll the device or enable remote management.
router.post('/', async (req, res, next) => {
  const {
    asset_tag,
    display_name,
    manufacturer,
    model,
    ownership_type,
    assigned_to
  } = req.body || {};

  const normalizedAssetTag =
    typeof asset_tag === 'string' ? asset_tag.trim() : '';

  const normalizedDisplayName =
    typeof display_name === 'string' ? display_name.trim() : '';

  const normalizedOwnershipType =
    typeof ownership_type === 'string'
      ? ownership_type.trim().toUpperCase()
      : '';

  if (
    !normalizedAssetTag ||
    !normalizedDisplayName ||
    !VALID_OWNERSHIP_TYPES.has(normalizedOwnershipType)
  ) {
    return res.status(400).json({
      error:
        'asset_tag, display_name, and a valid ownership_type are required.'
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Detect whether the multi-tenant migration has been applied.
    const schemaCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'devices'
          AND column_name = 'organization_id'
      ) AS migrated
    `);

    let result;

    const values = [
      normalizedAssetTag,
      normalizedDisplayName,
      cleanOptionalString(manufacturer),
      cleanOptionalString(model),
      normalizedOwnershipType,
      cleanOptionalString(assigned_to)
    ];

    if (schemaCheck.rows[0]?.migrated) {
      result = await client.query(
        `INSERT INTO devices (
           asset_tag,
           display_name,
           manufacturer,
           model,
           ownership_type,
           assigned_to,
           organization_id
         )
         SELECT $1, $2, $3, $4, $5, $6, id
         FROM organisations
         WHERE slug = 'nexus-pro-internal'
         RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          error: 'Internal organisation was not found.'
        });
      }
    } else {
      result = await client.query(
        `INSERT INTO devices (
           asset_tag,
           display_name,
           manufacturer,
           model,
           ownership_type,
           assigned_to
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        values
      );
    }

    const device = result.rows[0];

    await client.query(
      `INSERT INTO audit_logs (
         actor_email,
         action,
         target_type,
         target_id
       )
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.email,
        'DEVICE_INVENTORY_CREATED',
        'DEVICE',
        String(device.id)
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({ device });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
    }

    if (err.code === '23505') {
      return res.status(409).json({
        error: 'That asset tag already exists.'
      });
    }

    return next(err);
  } finally {
    client?.release();
  }
});

// Retrieve one device by ID.
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM devices
       WHERE id = $1`,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Device not found.'
      });
    }

    return res.json({ device: rows[0] });
  } catch (err) {
    return next(err);
  }
});

export default router;
