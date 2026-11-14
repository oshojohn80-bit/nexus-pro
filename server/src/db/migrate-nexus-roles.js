import 'dotenv/config';
import { pool } from './pool.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Confirm the multi-tenant migration has already been applied.
    const schemaCheck = await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'admin_users'
          AND column_name = 'organization_id'
        ) AS has_organization_id,
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'organisations'
        ) AS has_organisations
    `);

    if (
      !schemaCheck.rows[0].has_organization_id ||
      !schemaCheck.rows[0].has_organisations
    ) {
      throw new Error(
        'Run the multi-tenant migration before the NEXUS roles migration.'
      );
    }

    // Add administrator management fields safely.
    await client.query(`
      ALTER TABLE admin_users
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_by TEXT
    `);

    // Remove previous role-related CHECK constraints.
    const oldConstraints = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'admin_users'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%role%'
    `);

    for (const row of oldConstraints.rows) {
      await client.query(
        `ALTER TABLE admin_users DROP CONSTRAINT "${row.conname}"`
      );
    }

    // Define the four NEXUS PRO administrator roles.
    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT nexus_admin_role_check
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
      )
    `);

    // Validate administrator status.
    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT nexus_admin_status_check
      CHECK (status IN ('ACTIVE', 'SUSPENDED'))
    `);

    // Permissions must always be a JSON object.
    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT nexus_admin_permissions_check
      CHECK (jsonb_typeof(permissions) = 'object')
    `);

    // Add useful indexes.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_users_role_status
      ON admin_users (role, status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_users_organisation
      ON admin_users (organization_id)
    `);

    // Protect the last active SUPER_ADMIN and MAIN_ADMIN.
    await client.query(`
      CREATE OR REPLACE FUNCTION protect_last_main_admin()
      RETURNS TRIGGER AS $$
      DECLARE
        remaining_admins INTEGER;
        protected_role TEXT;
        removing_admin BOOLEAN := FALSE;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          protected_role := OLD.role;
          removing_admin := TRUE;
        ELSIF TG_OP = 'UPDATE' THEN
          protected_role := OLD.role;

          IF OLD.status = 'ACTIVE'
             AND OLD.role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
             AND (
               NEW.status <> 'ACTIVE'
               OR NEW.role <> OLD.role
             )
          THEN
            removing_admin := TRUE;
          END IF;
        END IF;

        IF removing_admin
           AND OLD.status = 'ACTIVE'
           AND protected_role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
        THEN
          SELECT COUNT(*)::INTEGER
          INTO remaining_admins
          FROM admin_users
          WHERE role = protected_role
            AND status = 'ACTIVE'
            AND id <> OLD.id;

          IF remaining_admins < 1 THEN
            RAISE EXCEPTION
              'Cannot remove or suspend the last active % account.',
              protected_role;
          END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Ensure the protection trigger exists.
    await client.query(`
      DROP TRIGGER IF EXISTS nexus_protect_last_admin
      ON admin_users
    `);

    await client.query(`
      CREATE TRIGGER nexus_protect_last_admin
      BEFORE UPDATE OR DELETE ON admin_users
      FOR EACH ROW
      EXECUTE FUNCTION protect_last_main_admin()
    `);

    await client.query('COMMIT');

    console.log('NEXUS PRO roles migration completed successfully.');
    console.log('Roles: SUPER_ADMIN, MAIN_ADMIN, ORG_ADMIN, ADMIN');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('NEXUS PRO roles migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => {
  process.exit(1);
});
