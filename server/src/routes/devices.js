import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT * FROM devices ORDER BY created_at DESC'); res.json({ devices: rows }); }
  catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  try {
    const { asset_tag, display_name, manufacturer = null, model = null, ownership_type, assigned_to = null } = req.body || {};
    if (!asset_tag || !display_name || !['COMPANY_OWNED','EMPLOYEE_OWNED'].includes(ownership_type)) return res.status(400).json({ error: 'asset_tag, display_name, and a valid ownership_type are required.' });
    const { rows } = await pool.query(
      `INSERT INTO devices (asset_tag, display_name, manufacturer, model, ownership_type, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [String(asset_tag).trim(), String(display_name).trim(), manufacturer, model, ownership_type, assigned_to]
    );
    await pool.query('INSERT INTO audit_logs (actor_email, action, target_type, target_id) VALUES ($1,$2,$3,$4)', [req.user.email, 'DEVICE_INVENTORY_CREATED', 'DEVICE', String(rows[0].id)]);
    res.status(201).json({ device: rows[0] });
  } catch (err) { if (err.code === '23505') return res.status(409).json({ error: 'That asset tag already exists.' }); next(err); }
});
router.get('/:id', async (req, res, next) => {
  try { const { rows } = await pool.query('SELECT * FROM devices WHERE id = $1', [req.params.id]); if (!rows[0]) return res.status(404).json({ error: 'Device not found.' }); res.json({ device: rows[0] }); }
  catch (err) { next(err); }
});
export default router;
