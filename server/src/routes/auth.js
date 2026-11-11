import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const { rows } = await pool.query('SELECT id, email, password_hash, role FROM admin_users WHERE email = $1', [email]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ sub: String(admin.id), email: admin.email, role: admin.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    await pool.query('INSERT INTO audit_logs (actor_email, action, target_type, target_id) VALUES ($1,$2,$3,$4)', [admin.email, 'ADMIN_LOGIN', 'ADMIN_USER', String(admin.id)]);
    res.json({ token, user: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (err) { next(err); }
});
router.get('/me', requireAuth, async (req, res, next) => {
  try { res.json({ id: Number(req.user.sub), email: req.user.email, role: req.user.role }); }
  catch (err) { next(err); }
});
export default router;
