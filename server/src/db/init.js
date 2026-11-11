import dotenv from 'dotenv';
import { pool } from './pool.js';
dotenv.config();
const sql = `
CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SUPER_ADMIN' CHECK (role = 'SUPER_ADMIN'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('COMPANY_OWNED','EMPLOYEE_OWNED')),
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  compliance_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
`;
try { await pool.query(sql); console.log('NEXUS PRO database schema is ready.'); }
catch (err) { console.error('Database initialization failed:', err.message); process.exitCode = 1; }
finally { await pool.end(); }
