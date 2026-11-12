import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  requireAuth,
  requirePermission
} from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('dashboard'));

router.get('/summary', async (req, res, next) => {
  try {
    const allowedRoles = ['SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'You are not authorised to view this dashboard.'
      });
    }

    const [counts, events] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status = 'ONLINE'
          )::int AS online,
          COUNT(*) FILTER (
            WHERE status <> 'ONLINE'
          )::int AS offline,
          COUNT(*) FILTER (
            WHERE compliance_status = 'NON_COMPLIANT'
          )::int AS non_compliant,
          COUNT(*) FILTER (
            WHERE ownership_type = 'COMPANY_OWNED'
          )::int AS company_owned,
          COUNT(*) FILTER (
            WHERE ownership_type = 'EMPLOYEE_OWNED'
          )::int AS employee_owned
        FROM devices
      `),

      pool.query(`
        SELECT
          id,
          severity,
          title,
          description,
          created_at
        FROM security_events
        ORDER BY created_at DESC
        LIMIT 8
      `)
    ]);

    return res.json({
      ...counts.rows[0],
      recent_events: events.rows,
      android_enterprise: {
        connected: false,
        note: 'Android Enterprise is not connected. Counts reflect manually registered inventory only; live telemetry and remote actions are unavailable.'
      }
    });

  } catch (error) {
    return next(error);
  }
});

export default router;
