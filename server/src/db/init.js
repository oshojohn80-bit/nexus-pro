import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from './pool.js';
const here = dirname(fileURLToPath(import.meta.url));
try {
  const sql = fs.readFileSync(resolve(here, 'schema.sql'), 'utf8');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(sql);
  console.log('Database schema initialized.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally { await pool.end(); }
