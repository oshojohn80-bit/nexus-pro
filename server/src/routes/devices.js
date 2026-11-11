import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// Super Admin can view all devices.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM devices ORDER BY created_at DESC'
    );

    res.json({ devices: rows });
  } catch (err) {
    next(err);
  }
});

// Register a device.
router.post('/', async (req, res, next) => {
  try {
    const {
      asset_tag,
      display_name,
      manufacturer = null,
      model = null,
      ownership_type,
      assigned_to = null
    } = req.body || {};

    if (
      !asset_tag ||
      !display_name ||
      !['COMPANY_OWNED', 'EMPLOYEE_OWNED'].includes(ownership_type)
    ) {
      return res.status(400).json({
        error: 'asset_tag, display_name, and a valid ownership_type are required.'
      });
    }

    // Detect whether the multi-tenant migration has been applied.
    const schemaCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'devices'
          AND column_name = 'organization_id'
      ) AS migrated
    `);

    let result;

    if (schemaCheck.rows[0].migrated) {
      result = await pool.query(
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
        [
          String(asset_tag).trim(),
          String(display_name).trim(),
          manufacturer,
          model,
          ownership_type,
          assigned_to
        ]
      );

      if (!result.rows[0]) {
        return res.status(500).json({
          error: 'Internal organisation was not found.'
        });
      }
    } else {
      result = await pool.query(
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
        [
          String(asset_tag).trim(),
          String(display_name).trim(),
          manufacturer,
          model,
          ownership_type,
          assigned_to
        ]
      );
    }

    await pool.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.email,
        'DEVICE_INVENTORY_CREATED',
        'DEVICE',
        String(result.rows[0].id)
      ]
    );

    res.status(201).json({ device: result.rows[0] });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'That asset tag already exists.'
      });
    }

    next(err);
  }
});

// Retrieve an individual device.
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM devices WHERE id = $1',
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Device not found.'
      });
    }

    res.json({ device: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
