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
         COALESCE(to_jsonb(admin_users)->>'status', 'ACTIVE') AS status,
         to_jsonb(admin_users)->>'organization_id' AS organization_id
       FROM admin_users
       WHERE email = $1`,
      [email]
    );

    const admin = rows[0];

    // Use the same response for unknown users and incorrect passwords.
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    if (String(admin.status).toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This administrator account is not active. Contact your Super Admin.'
      });
    }

    // Tenant administrator access remains disabled until tenant isolation
    // has been implemented and verified across every protected API route.
    if (admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Organisation administrator access is not enabled yet.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Authentication is not configured on the server.'
      });
    }

    const organizationId = admin.organization_id
      ? Number(admin.organization_id)
      : null;

    const token = jwt.sign(
      {
        sub: String(admin.id),
        email: admin.email,
        role: admin.role,
        organization_id: organizationId
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

    return res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        organization_id: organizationId
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    id: Number(req.user.sub),
    email: req.user.email,
    role: req.user.role,
    organization_id: req.user.organization_id ?? null
  });
});

export default router;
