import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT id, actor_email, action, target_type, target_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200'); res.json({ logs: rows }); }
  catch (err) { next(err); }
});
export default router;
