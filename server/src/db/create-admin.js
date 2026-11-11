import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool } from './pool.js';
dotenv.config();
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 14) {
  console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 14 characters in .env.');
  process.exit(1);
}
try {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users(email,password_hash) VALUES($1,$2)
     ON CONFLICT(email) DO NOTHING`, [email.toLowerCase(), hash]
  );
  console.log(`Super Admin account ensured for ${email}.`);
} catch (err) { console.error(err); process.exitCode = 1; }
finally { await pool.end(); }
