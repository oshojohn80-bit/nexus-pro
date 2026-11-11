import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

dotenv.config();

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationFile = join(currentDir, 'migration-multi-tenant.sql');

async function runMigration() {
  try {
    console.log('Starting NEXUS PRO multi-tenant migration...');

    const sql = await readFile(migrationFile, 'utf8');

    if (!sql.trim()) {
      throw new Error('Migration file is empty.');
    }

    await pool.query(sql);

    console.log('Multi-tenant database migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await runMigration();
