import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  requireAuth,
  requirePermission
} from '../middleware/auth.js';
const router = Router();

router.use(requireAuth);
router.use(requirePermission('audit_logs'));
router.get('/', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'You are not authorised to view these audit logs.'
      });
    }

    const { rows } = await pool.query(`
      SELECT
        id,
        actor_email,
        action,
        target_type,
        target_id,
        created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 200
    `);

    return res.json({ logs: rows });

  } catch (err) {
    return next(err);
  }
});

    const migrated = schemaCheck.rows[0].migrated;

    // Organisation Admin access requires the migrated schema.
    if (req.user.role === 'ORG_ADMIN' && !migrated) {
      return res.status(403).json({
        error: 'Organisation-level audit access is not available yet.'
      });
    }

    let result;

    if (req.user.role === 'SUPER_ADMIN') {
      // Super Admin can review platform-wide audit activity.
      result = await pool.query(`
        SELECT
          id,
          actor_email,
          action,
          target_type,
          target_id,
          created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 200
      `);
    } else if (
      req.user.role === 'ORG_ADMIN' &&
      req.user.organization_id
    ) {
      // Organisation Admin can only review their organisation's logs.
      result = await pool.query(`
        SELECT
          id,
          actor_email,
          action,
          target_type,
          target_id,
          created_at
        FROM audit_logs
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 200
      `, [req.user.organization_id]);
    } else {
      return res.status(403).json({
        error: 'You are not authorised to view these audit logs.'
      });
    }

    res.json({ logs: result.rows });

  } catch (err) {
    next(err);
  }
});

export default router;
