import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  requireAuth,
  requirePermission
} from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('screen_control'));

// Request a consent-based screen-sharing session.
router.post('/sessions', async (req, res, next) => {
  try {
    const deviceId = Number(req.body.deviceId);

    if (!Number.isSafeInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({
        error: 'A valid deviceId is required.'
      });
    }

    const device = await pool.query(
      'SELECT id FROM devices WHERE id = $1',
      [deviceId]
    );

    if (!device.rowCount) {
      return res.status(404).json({
        error: 'Device not found.'
      });
    }

    const activeSession = await pool.query(
      `SELECT id
       FROM screen_control_sessions
       WHERE device_id = $1
         AND status IN ('REQUESTED', 'CONSENTED', 'ACTIVE')
       LIMIT 1`,
      [deviceId]
    );

    if (activeSession.rowCount) {
      return res.status(409).json({
        error: 'This device already has an open Screen Control session.'
      });
    }

    const result = await pool.query(
      `INSERT INTO screen_control_sessions
       (device_id, requested_by, requested_by_email, status)
       VALUES ($1, $2, $3, 'REQUESTED')
       RETURNING id, device_id, status, requested_at`,
      [deviceId, req.user.sub, req.user.email]
    );

    await pool.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.email,
        'SCREEN_CONTROL_REQUESTED',
        'DEVICE',
        String(deviceId),
        JSON.stringify({ sessionId: result.rows[0].id })
      ]
    );

    return res.status(201).json({
      message: 'Screen Control request created. Device-user consent is required.',
      session: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// List recent Screen Control sessions.
router.get('/sessions', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, device_id, requested_by_email, status,
              requested_at, consented_at, started_at, ended_at,
              ended_by, end_reason
       FROM screen_control_sessions
       ORDER BY requested_at DESC
       LIMIT 100`
    );

    return res.json({ sessions: result.rows });
  } catch (error) {
    next(error);
  }
});

// End an open session. This does not remotely stop Android capture;
// device-side integration is required for that.
router.post('/sessions/:id/end', async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);

    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        error: 'Invalid session ID.'
      });
    }

    const result = await pool.query(
      `UPDATE screen_control_sessions
       SET status = 'ENDED',
           ended_at = NOW(),
           ended_by = $2,
           end_reason = 'ADMIN_ENDED'
       WHERE id = $1
         AND status IN ('REQUESTED', 'CONSENTED', 'ACTIVE')
       RETURNING id, device_id, status, ended_at`,
      [sessionId, req.user.email]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Open session not found.'
      });
    }

    await pool.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.email,
        'SCREEN_CONTROL_ENDED',
        'SCREEN_CONTROL_SESSION',
        String(sessionId),
        JSON.stringify({ deviceId: result.rows[0].device_id })
      ]
    );

    return res.json({
      message: 'Session marked as ended.',
      session: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router;
