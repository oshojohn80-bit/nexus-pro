BEGIN;

-- 1. Create organisations
CREATE TABLE IF NOT EXISTS organisations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create the internal NEXUS PRO organisation
INSERT INTO organisations (name, slug)
VALUES ('NEXUS PRO Internal', 'nexus-pro-internal')
ON CONFLICT (slug) DO NOTHING;

-- 3. Add organisation references
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS organization_id BIGINT
REFERENCES organisations(id);

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS organization_id BIGINT
REFERENCES organisations(id);

ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS organization_id BIGINT
REFERENCES organisations(id);

ALTER TABLE security_events
ADD COLUMN IF NOT EXISTS organization_id BIGINT
REFERENCES organisations(id);

-- 4. Assign existing devices to the internal organisation
UPDATE devices
SET organization_id = (
  SELECT id
  FROM organisations
  WHERE slug = 'nexus-pro-internal'
)
WHERE organization_id IS NULL;

-- 5. Require every device to belong to an organisation
ALTER TABLE devices
ALTER COLUMN organization_id SET NOT NULL;

-- 6. Make asset tags unique within each organisation
ALTER TABLE devices
DROP CONSTRAINT IF EXISTS devices_asset_tag_key;

CREATE UNIQUE INDEX IF NOT EXISTS
devices_organisation_asset_tag_unique
ON devices (organization_id, asset_tag);

-- 7. Replace the old administrator role constraint
ALTER TABLE admin_users
DROP CONSTRAINT IF EXISTS admin_users_role_check;

ALTER TABLE admin_users
ADD CONSTRAINT admin_users_role_check
CHECK (
  (
    role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
    AND organization_id IS NULL
  )
  OR
  (
    role = 'ORG_ADMIN'
    AND organization_id IS NOT NULL
  )
  OR
  (
    role = 'ADMIN'
  )
);

-- 8. Add organisation indexes
CREATE INDEX IF NOT EXISTS
devices_organisation_idx
ON devices (organization_id);

CREATE INDEX IF NOT EXISTS
admin_users_organisation_idx
ON admin_users (organization_id);

CREATE INDEX IF NOT EXISTS
audit_logs_organisation_idx
ON audit_logs (organization_id);

CREATE INDEX IF NOT EXISTS
security_events_organisation_idx
ON security_events (organization_id);

COMMIT;
