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

export default router;
