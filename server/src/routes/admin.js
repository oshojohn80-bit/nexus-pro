import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const MAIN_ADMIN_ROLES = ['SUPER_ADMIN', 'MAIN_ADMIN'];

const PERMISSIONS = [
  'dashboard',
  'devices',
  'screen_control',
  'applications',
  'security_policies',
  'remote_lock_wipe',
  'employees',
  'reports',
  'audit_logs',
  'organization_settings'
];

function isMainAdmin(role) {
  return MAIN_ADMIN_ROLES.includes(role);
}

function requireMainAdmin(req, res, next) {
  if (!isMainAdmin(req.user?.role)) {
    return res.status(403).json({
      error: 'Main Admin access required.'
    });
  }

  next();
}

function validatePermissions(permissions) {
  if (
    !permissions ||
    typeof permissions !== 'object' ||
    Array.isArray(permissions)
  ) {
    return false;
  }

  return Object.entries(permissions).every(
    ([key, value]) =>
      PERMISSIONS.includes(key) && typeof value === 'boolean'
  );
}

async function verifyMainAdminPassword(req) {
  const password = String(req.body?.currentPassword || '');

  if (!password) return false;

  const { rows } = await pool.query(
    `SELECT password_hash
     FROM admin_users
     WHERE id = $1
       AND status = 'ACTIVE'
       AND role IN ('SUPER_ADMIN', 'MAIN_ADMIN')`,
    [req.user.sub]
  );

  if (!rows[0]) return false;

  return bcrypt.compare(password, rows[0].password_hash);
}

// List administrator accounts.
router.get('/', requireMainAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        email,
        role,
        status,
        permissions,
        created_at,
        updated_at,
        last_login_at
      FROM admin_users
      ORDER BY
        CASE WHEN role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
          THEN 0 ELSE 1 END,
        email
    `);

    res.json({
      admins: rows,
      permissions: PERMISSIONS,
      main_admin_limit: 3
    });
  } catch (error) {
    next(error);
  }
});

// Create an administrator account.
router.post('/', requireMainAdmin, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const confirmed = await verifyMainAdminPassword(req);

    if (!confirmed) {
      return res.status(403).json({
        error: 'Current Main Admin password is incorrect or missing.'
      });
    }

    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'ADMIN');
    const permissions = req.body?.permissions || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Enter a valid email address.'
      });
    }

    if (password.length < 14) {
      return res.status(400).json({
        error: 'Password must contain at least 14 characters.'
      });
    }

    if (!['MAIN_ADMIN', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid administrator role.'
      });
    }

    if (!validatePermissions(permissions)) {
      return res.status(400).json({
        error: 'One or more permissions are invalid.'
      });
    }

    if (
      role === 'MAIN_ADMIN' &&
      Object.keys(permissions).length > 0
    ) {
      return res.status(400).json({
        error: 'Main Admins automatically receive full access.'
      });
    }

    await client.query('BEGIN');

    if (role === 'MAIN_ADMIN') {
      await client.query(
        'SELECT pg_advisory_xact_lock(741852963)'
      );

      const count = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM admin_users
        WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
      `);

      if (count.rows[0].total >= 3) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: 'All three fixed Main Admin positions are occupied.'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await client.query(
      `INSERT INTO admin_users
       (email, password_hash, role, status, permissions)
       VALUES ($1, $2, $3, 'ACTIVE', $4::jsonb)
       RETURNING id, email, role, status, permissions, created_at`,
      [
        email,
        passwordHash,
        role,
        JSON.stringify(role === 'ADMIN' ? permissions : {})
      ]
    );

    await client.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, 'ADMIN_CREATED', 'ADMIN_USER', $2, $3::jsonb)`,
      [
        req.user.email,
        String(result.rows[0].id),
        JSON.stringify({ email, role })
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      admin: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'An administrator with this email already exists.'
      });
    }

    next(error);
  } finally {
    client.release();
  }
});

// Update permissions for an ordinary Admin.
router.patch(
  '/:id/permissions',
  requireMainAdmin,
  async (req, res, next) => {
    try {
      const confirmed = await verifyMainAdminPassword(req);

      if (!confirmed) {
        return res.status(403).json({
          error: 'Current Main Admin password is incorrect or missing.'
        });
      }

      const adminId = Number(req.params.id);
      const permissions = req.body?.permissions;

      if (!Number.isSafeInteger(adminId) || adminId < 1) {
        return res.status(400).json({
          error: 'Invalid administrator ID.'
        });
      }

      if (!validatePermissions(permissions)) {
        return res.status(400).json({
          error: 'Invalid permissions.'
        });
      }

      let client;
let transactionStarted = false;

try {
  client = await pool.connect();
        await client.query('BEGIN');
  transactionStarted = true;

        const result = await client.query(
          `UPDATE admin_users
           SET permissions = $1::jsonb, updated_at = NOW()
           WHERE id = $2 AND role = 'ADMIN'
           RETURNING id, email, role, status, permissions`,
          [JSON.stringify(permissions), adminId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');

          return res.status(404).json({
            error: 'Ordinary Admin account not found.'
          });
        }

        await client.query(
          `INSERT INTO audit_logs
           (actor_email, action, target_type, target_id, details)
           VALUES ($1, 'ADMIN_PERMISSIONS_UPDATED',
                   'ADMIN_USER', $2, $3::jsonb)`,
          [
            req.user.email,
            String(adminId),
            JSON.stringify({ permissions })
          ]
        );

        await client.query('COMMIT');

        res.json({ admin: result.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  }
);
// Suspend an administrator account.
router.patch('/:id/suspend', requireMainAdmin, async (req, res, next) => {
 let client;
let transactionStarted = false;

try {
  client = await pool.connect();
    const confirmed = await verifyMainAdminPassword(req);

    if (!confirmed) {
      return res.status(403).json({
        error: 'Current Main Admin password is incorrect or missing.'
      });
    }

    const adminId = Number(req.params.id);

    if (!Number.isSafeInteger(adminId) || adminId < 1) {
      return res.status(400).json({
        error: 'Invalid administrator ID.'
      });
    }

    await client.query('BEGIN');
  transactionStarted = true;

    const result = await client.query(
      `UPDATE admin_users
       SET status = 'SUSPENDED',
           suspended_at = NOW(),
           suspended_by = $1,
           updated_at = NOW()
       WHERE id = $2
         AND status = 'ACTIVE'
       RETURNING id, email, role, status`,
      [req.user.email, adminId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Active administrator account not found.'
      });
    }

    await client.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, 'ADMIN_SUSPENDED', 'ADMIN_USER', $2, $3::jsonb)`,
      [
        req.user.email,
      await client.query('COMMIT');
transactionStarted = false;

res.json({ admin: result.rows[0] });
} catch (error) {
  if (client && transactionStarted) {
    await client.query('ROLLBACK');
  }

  if (error.message.includes('last active Main Admin')) {
    return res.status(409).json({ error: error.message });
  }

  next(error);
} finally {
  client?.release();
}
});

// Reactivate a suspended administrator account.
router.patch('/:id/reactivate', requireMainAdmin, async (req, res, next) => {
 let client;
let transactionStarted = false;

try {
  client = await pool.connect();
    const confirmed = await verifyMainAdminPassword(req);

    if (!confirmed) {
      return res.status(403).json({
        error: 'Current Main Admin password is incorrect or missing.'
      });
    }

   const adminId = Number(req.params.id);

if (!Number.isSafeInteger(adminId) || adminId < 1) {
  return res.status(400).json({
    error: 'Invalid administrator ID.'
  });
}

await client.query('BEGIN');
  transactionStarted = true;

    const result = await client.query(
      `UPDATE admin_users
       SET status = 'ACTIVE',
           suspended_at = NULL,
           suspended_by = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'SUSPENDED'
       RETURNING id, email, role, status`,
      [adminId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Suspended administrator account not found.'
      });
    }

    await client.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, 'ADMIN_REACTIVATED', 'ADMIN_USER', $2, $3::jsonb)`,
      [
        req.user.email,
        String(adminId),
        JSON.stringify({ email: result.rows[0].email })
      ]
    );

 await client.query('COMMIT');
transactionStarted = false;

res.json({ admin: result.rows[0] });
} catch (error) {
  if (client && transactionStarted) {
    await client.query('ROLLBACK');
  }

  next(error);
} finally {
  client?.release();
}
});
// Delete an administrator account.
router.delete('/:id', requireMainAdmin, async (req, res, next) => {
  let client;
  let transactionStarted = false;

  try {
    const confirmed = await verifyMainAdminPassword(req);

    if (!confirmed) {
      return res.status(403).json({
        error: 'Current Main Admin password is incorrect or missing.'
      });
    }

    const adminId = Number(req.params.id);

    if (!Number.isSafeInteger(adminId) || adminId < 1) {
      return res.status(400).json({
        error: 'Invalid administrator ID.'
      });
    }

    if (String(adminId) === String(req.user.sub)) {
      return res.status(400).json({
        error: 'You cannot delete your own account.'
      });
    }

    client = await pool.connect();

    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query(
      `DELETE FROM admin_users
       WHERE id = $1
       RETURNING id, email, role`,
      [adminId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(404).json({
        error: 'Administrator account not found.'
      });
    }

    const deleted = result.rows[0];

    await client.query(
      `INSERT INTO audit_logs
       (actor_email, action, target_type, target_id, details)
       VALUES ($1, 'ADMIN_DELETED', 'ADMIN_USER', $2, $3::jsonb)`,
      [
        req.user.email,
        String(adminId),
        JSON.stringify({
          email: deleted.email,
          role: deleted.role
        })
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      message: 'Administrator account deleted.',
      admin: deleted
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK');
    }

    next(error);
  } finally {
    client?.release();
  }
});
export default router;
