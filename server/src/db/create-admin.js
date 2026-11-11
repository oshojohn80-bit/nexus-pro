import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
dotenv.config();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
try {
  if (!email || !password || password.length < 14) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 14 characters.');
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash]
  );
  console.log(`Super Admin account is ready for ${email}.`);
} catch (err) { console.error('Admin creation failed:', err.message); process.exitCode = 1; }
finally { await pool.end(); }
