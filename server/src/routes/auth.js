import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const { rows } = await pool.query('SELECT * FROM admin_users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ sub: String(user.id), email: user.email, role: user.role },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    await pool.query(
      'INSERT INTO audit_logs(actor_email,action,target_type,details) VALUES($1,$2,$3,$4)',
      [user.email, 'ADMIN_LOGIN', 'SESSION', JSON.stringify({ outcome: 'success' })]
    );
    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login service unavailable' });
  }
});
router.get('/me', requireAuth, (req,res) => res.json({ email:req.user.email, role:req.user.role }));
export default router;
