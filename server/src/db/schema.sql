CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SUPER_ADMIN' CHECK (role IN ('SUPER_ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('COMPANY_OWNED','EMPLOYEE_OWNED')),
  management_mode TEXT NOT NULL CHECK (management_mode IN ('FULLY_MANAGED','WORK_PROFILE')),
  assigned_to TEXT,
  manufacturer TEXT,
  model TEXT,
  android_version TEXT,
  security_patch_level TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ONLINE','OFFLINE','UNKNOWN')),
  compliance_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (compliance_status IN ('COMPLIANT','NON_COMPLIANT','UNKNOWN')),
  last_seen_at TIMESTAMPTZ,
  enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (ownership_type = 'COMPANY_OWNED' AND management_mode = 'FULLY_MANAGED')
    OR
    (ownership_type = 'EMPLOYEE_OWNED' AND management_mode = 'WORK_PROFILE')
  )
);

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ADMIN_PORTAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
