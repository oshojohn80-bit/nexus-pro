import dotenv from 'dotenv';
import { pool } from './pool.js';

dotenv.config();

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add account-management fields without deleting existing data.
    await client.query(`
      ALTER TABLE admin_users
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_by TEXT;
    `);

    // Replace the old role restriction safely.
    await client.query(`
      DO $$
      DECLARE
        constraint_record RECORD;
      BEGIN
        FOR constraint_record IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'admin_users'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%role%'
        LOOP
          EXECUTE format(
            'ALTER TABLE admin_users DROP CONSTRAINT %I',
            constraint_record.conname
          );
        END LOOP;
      END $$;
    `);

    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_role_check
      CHECK (role IN ('SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'));
    `);

    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_status_check
      CHECK (status IN ('ACTIVE', 'SUSPENDED'));
    `);

    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_permissions_object_check
      CHECK (jsonb_typeof(permissions) = 'object');
    `);

    // Add structured audit details.
    await client.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS admin_users_role_status_idx
      ON admin_users(role, status);
    `);

    // Prevent removal or suspension of the last active Main Admin.
    await client.query(`
      CREATE OR REPLACE FUNCTION protect_last_main_admin()
      RETURNS TRIGGER AS $$
      DECLARE
        active_count INTEGER;
      BEGIN
        IF OLD.role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
           AND OLD.status = 'ACTIVE'
           AND (
             TG_OP = 'DELETE'
             OR NEW.role NOT IN ('SUPER_ADMIN', 'MAIN_ADMIN')
             OR NEW.status <> 'ACTIVE'
           )
        THEN
          PERFORM pg_advisory_xact_lock(741852963);

          SELECT COUNT(*) INTO active_count
          FROM admin_users
          WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
            AND status = 'ACTIVE'
            AND id <> OLD.id;

          IF active_count < 1 THEN
            RAISE EXCEPTION
              'The last active Main Admin cannot be removed or suspended.';
          END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS protect_last_main_admin_trigger
      ON admin_users;
    `);

    await client.query(`
      CREATE TRIGGER protect_last_main_admin_trigger
      BEFORE UPDATE OR DELETE ON admin_users
      FOR EACH ROW
      EXECUTE FUNCTION protect_last_main_admin();
    `);

    await client.query('COMMIT');

    console.log('NEXUS PRO admin permissions migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .catch(error => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
