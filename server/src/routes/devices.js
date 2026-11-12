import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  requireAuth,
  requirePermission
} from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('devices'));

const DEVICE_FIELDS = `
  id,
  asset_tag,
  display_name,
  manufacturer,
  model,
  ownership_type,
  assigned_to,
  status,
  compliance_status,
  enrolled,
  created_at,
  updated_at
`;

// List devices.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT ${DEVICE_FIELDS}
      FROM devices
      ORDER BY created_at DESC
    `);

    return res.json({ devices: rows });
  } catch (error) {
    return next(error);
  }
});

// Register a device and record the audit event atomically.
router.post('/', async (req, res, next) => {
  let client;
  let transactionStarted = false;

  try {
    const assetTag = String(req.body?.asset_tag || '').trim();
    const displayName = String(req.body?.display_name || '').trim();
    const manufacturer = String(req.body?.manufacturer || '').trim() || null;
    const model = String(req.body?.model || '').trim() || null;
    const assignedTo = String(req.body?.assigned_to || '').trim() || null;
    const ownershipType = String(req.body?.ownership_type || '');

    if (!assetTag || !displayName) {
      return res.status(400).json({
        error: 'Asset tag and display name are required.'
      });
    }

    if (!['COMPANY_OWNED', 'EMPLOYEE_OWNED'].includes(ownershipType)) {
      return res.status(400).json({
        error: 'Invalid device ownership type.'
      });
    }

    client = await pool.connect();

    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query(
      `INSERT INTO devices (
        asset_tag,
        display_name,
        manufacturer,
        model,
        ownership_type,
        assigned_to
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${DEVICE_FIELDS}`,
      [
        assetTag,
        displayName,
        manufacturer,
        model,
        ownershipType,
        assignedTo
      ]
    );

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
    transactionStarted = false;

    return res.status(201).json({ device });

  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Device registration rollback failed:', rollbackError);
      }
    }

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'That asset tag already exists.'
      });
    }

    return next(error);

  } finally {
    client?.release();
  }
});

// Retrieve an individual device.
router.get('/:id', async (req, res, next) => {
  try {
    const deviceId = Number(req.params.id);

    if (!Number.isSafeInteger(deviceId) || deviceId < 1) {
      return res.status(400).json({
        error: 'Invalid device ID.'
      });
    }

    const { rows } = await pool.query(
      `SELECT ${DEVICE_FIELDS}
       FROM devices
       WHERE id = $1`,
      [deviceId]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Device not found.'
      });
    }

    return res.json({ device: rows[0] });

  } catch (error) {
    return next(error);
  }
});

export default router;
