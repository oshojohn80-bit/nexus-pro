import 'dotenv/config';
import { pool } from './pool.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS screen_control_sessions (
        id BIGSERIAL PRIMARY KEY,
        device_id BIGINT NOT NULL,
        requested_by BIGINT NOT NULL,
        requested_by_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REQUESTED'
          CHECK (status IN (
            'REQUESTED',
            'CONSENTED',
            'ACTIVE',
            'ENDED',
            'DECLINED',
            'EXPIRED'
          )),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        consented_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        ended_by TEXT,
        end_reason TEXT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      screen_control_sessions_device_idx
      ON screen_control_sessions (device_id, requested_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      screen_control_sessions_status_idx
      ON screen_control_sessions (status, requested_at DESC);
    `);

    await client.query('COMMIT');
    console.log('Screen Control migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Screen Control migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
