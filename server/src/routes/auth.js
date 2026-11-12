import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const MAIN_ADMIN_ROLES = ['SUPER_ADMIN', 'MAIN_ADMIN'];

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const { rows } = await pool.query(
      `SELECT
         id,
         email,
         password_hash,
         role,
         status,
         permissions,
         to_jsonb(admin_users)->>'organization_id' AS organization_id
       FROM admin_users
       WHERE email = $1`,
      [email]
    );

    const admin = rows[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    if (admin.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This administrator account is inactive or suspended.'
      });
    }

    if (
      !MAIN_ADMIN_ROLES.includes(admin.role) &&
      admin.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        error: 'This account does not have dashboard access.'
      });
    }
await pool.query(
  `UPDATE admin_users
   SET last_login_at = NOW(),
       updated_at = NOW()
   WHERE id = $1`,
  [admin.id]
);
    const token = jwt.sign(
      {
        sub: String(admin.id),
        email: admin.email,
        role: admin.role,
        organization_id: admin.organization_id
          ? Number(admin.organization_id)
          : null
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
      }
    );

    await pool.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [
        admin.email,
        'ADMIN_LOGIN',
        'ADMIN_USER',
        String(admin.id)
      ]
    );

    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        permissions: admin.permissions || {},
        organization_id: admin.organization_id
          ? Number(admin.organization_id)
          : null
      }
    });

  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    id: Number(req.user.sub),
    email: req.user.email,
    role: req.user.role,
    permissions: req.user.permissions || {},
    organization_id: req.user.organization_id ?? null
  });
});

export default router;
