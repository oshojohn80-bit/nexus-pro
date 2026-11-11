import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (_req,res) => {
  const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  res.json({ logs: rows });
});
export default router;
