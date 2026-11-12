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
    // Check whether the multi-tenant migration has been applied.
    const schemaCheck = await pool.query(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'devices'
            AND column_name = 'organization_id'
        ) AS devices_migrated,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'security_events'
            AND column_name = 'organization_id'
        ) AS events_migrated
    `);

    const { devices_migrated, events_migrated } =
      schemaCheck.rows[0];

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isOrgAdmin = req.user.role === 'ORG_ADMIN';

if (!['SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'].includes(req.user.role)) {      return res.status(403).json({
        error: 'You are not authorised to view this dashboard.'
      });
    }

    if (isOrgAdmin && !req.user.organization_id) {
      return res.status(403).json({
        error: 'Your account is not assigned to an organisation.'
      });
    }

    if (
      isOrgAdmin &&
      (!devices_migrated || !events_migrated)
    ) {
      return res.status(403).json({
        error: 'Organisation dashboard access is not available yet.'
      });
    }

    let countsQuery;
    let eventsQuery;
    let queryParams = [];

    if (isOrgAdmin) {
      queryParams = [req.user.organization_id];

      countsQuery = `
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
        WHERE organization_id = $1
      `;

      eventsQuery = `
        SELECT
          id,
          severity,
          title,
          description,
          created_at
        FROM security_events
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 8
      `;
    } else {
      // Super Admin retains the platform-wide dashboard.
      countsQuery = `
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
      `;

      eventsQuery = `
        SELECT
          id,
          severity,
          title,
          description,
          created_at
        FROM security_events
        ORDER BY created_at DESC
        LIMIT 8
      `;
    }

    const [counts, events] = await Promise.all([
      pool.query(countsQuery, queryParams),
      pool.query(eventsQuery, queryParams)
    ]);

    res.json({
      ...counts.rows[0],
      recent_events: events.rows,
      android_enterprise: {
        connected: false,
        note: 'Android Enterprise is not connected. Counts reflect manually registered inventory only; live telemetry and remote actions are unavailable.'
      }
    });

  } catch (err) {
    next(err);
  }
});

export default router;
