import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { getIntegrationStatus } from '../services/androidEnterprise.js';
const router = Router();
router.use(requireAuth);
router.get('/summary', async (_req,res) => {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='ONLINE')::int AS online,
      COUNT(*) FILTER (WHERE status='OFFLINE')::int AS offline,
      COUNT(*) FILTER (WHERE compliance_status='NON_COMPLIANT')::int AS non_compliant,
      COUNT(*) FILTER (WHERE ownership_type='COMPANY_OWNED')::int AS company_owned,
      COUNT(*) FILTER (WHERE ownership_type='EMPLOYEE_OWNED')::int AS employee_owned
    FROM devices`);
  const events = await pool.query(
    `SELECT id,severity,title,description,created_at FROM security_events ORDER BY created_at DESC LIMIT 8`
  );
  res.json({ ...rows[0], recent_events: events.rows, android_enterprise: getIntegrationStatus() });
});
export default router;
