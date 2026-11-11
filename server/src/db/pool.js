import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const isHosted = /render\.com|amazonaws\.com/i.test(process.env.DATABASE_URL);
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isHosted ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
pool.on('error', err => console.error('Unexpected PostgreSQL pool error:', err));
