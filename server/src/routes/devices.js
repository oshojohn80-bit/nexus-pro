import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);

router.get('/', async (_req,res) => {
  const { rows } = await pool.query('SELECT * FROM devices ORDER BY created_at DESC LIMIT 1000');
  res.json({ devices: rows });
});
router.post('/', requireSuperAdmin, async (req,res) => {
  const b = req.body || {};
  const ownership = b.ownership_type;
  const mode = ownership === 'COMPANY_OWNED' ? 'FULLY_MANAGED' :
               ownership === 'EMPLOYEE_OWNED' ? 'WORK_PROFILE' : null;
  if (!mode || !b.asset_tag || !b.display_name) {
    return res.status(400).json({ error: 'asset_tag, display_name, and valid ownership_type are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO devices(asset_tag,display_name,ownership_type,management_mode,assigned_to,manufacturer,model)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.asset_tag,b.display_name,ownership,mode,b.assigned_to || null,b.manufacturer || null,b.model || null]
    );
    await pool.query(
      'INSERT INTO audit_logs(actor_email,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5)',
      [req.user.email,'DEVICE_INVENTORY_CREATED','DEVICE',rows[0].id,JSON.stringify({ asset_tag:b.asset_tag, ownership_type:ownership })]
    );
    res.status(201).json({ device: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Asset tag already exists' });
    console.error(err); res.status(500).json({ error: 'Could not create device record' });
  }
});
router.get('/:id', async (req,res) => {
  const { rows } = await pool.query('SELECT * FROM devices WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Device not found' });
  res.json({ device: rows[0] });
});
export default router;
