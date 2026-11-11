import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

const MAIN_ADMIN_ROLES = ['SUPER_ADMIN', 'MAIN_ADMIN'];

export async function requireAnyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT id, email, role, status, permissions
       FROM admin_users
       WHERE id = $1`,
      [decoded.sub]
    );

    const admin = rows[0];

    if (!admin || admin.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Your account is inactive. Please contact a Main Admin.'
      });
    }

    req.user = {
      sub: String(admin.id),
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || {}
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Your session is invalid or has expired. Please sign in again.'
      });
    }

    next(error);
  }
}

// Existing routes remain restricted to Main Admins.
export async function requireAuth(req, res, next) {
  return requireAnyAuth(req, res, () => {
    if (!MAIN_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Main Admin access required.'
      });
    }

    next();
  });
}

// Use this on routes that ordinary Admins may access.
export function requirePermission(permission) {
  return (req, res, next) => {
    if (MAIN_ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }

    if (
      req.user.role !== 'ADMIN' ||
      req.user.permissions?.[permission] !== true
    ) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.'
      });
    }

    next();
  };
}
