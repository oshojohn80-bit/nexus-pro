import 'dotenv/config';
import { pool } from './pool.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add administrator management fields.
    await client.query(`
      ALTER TABLE admin_users
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_by TEXT;
    `);

    // Update permitted administrator roles.
    await client.query(`
      ALTER TABLE admin_users
      DROP CONSTRAINT IF EXISTS admin_users_role_check;
    `);

    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_role_check
      CHECK (role IN ('SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'));
    `);

    // Validate account status.
    await client.query(`
      ALTER TABLE admin_users
      DROP CONSTRAINT IF EXISTS admin_users_status_check;
    `);

    await client.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_status_check
      CHECK (status IN ('ACTIVE', 'SUSPENDED'));
    `);

    // Ensure permissions are stored as a JSON object.
    await client.query(`
      ALTER TABLE admin_users
      DROP CONSTRAINT IF EXISTS admin_users_permissions_object_check;
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
        PERFORM pg_advisory_xact_lock(741852963);

        IF TG_OP = 'DELETE' THEN
          IF OLD.role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
             AND OLD.status = 'ACTIVE' THEN

            SELECT COUNT(*) INTO active_count
            FROM admin_users
            WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
              AND status = 'ACTIVE'
              AND id <> OLD.id;

            IF active_count < 1 THEN
              RAISE EXCEPTION
                'The last active Main Admin cannot be removed.';
            END IF;
          END IF;

          RETURN OLD;
        END IF;

        IF OLD.role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
           AND OLD.status = 'ACTIVE'
           AND (
             NEW.role NOT IN ('SUPER_ADMIN', 'MAIN_ADMIN')
             OR NEW.status <> 'ACTIVE'
           ) THEN

          SELECT COUNT(*) INTO active_count
          FROM admin_users
          WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
            AND status = 'ACTIVE'
            AND id <> OLD.id;

          IF active_count < 1 THEN
            RAISE EXCEPTION
              'The last active Main Admin cannot be suspended or demoted.';
          END IF;
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

    // Enforce a maximum of three fixed Main Admin positions.
    await client.query(`
      CREATE OR REPLACE FUNCTION enforce_main_admin_limit()
      RETURNS TRIGGER AS $$
      DECLARE
        existing_count INTEGER;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.role IN ('SUPER_ADMIN', 'MAIN_ADMIN') THEN
            PERFORM pg_advisory_xact_lock(741852963);

            SELECT COUNT(*) INTO existing_count
            FROM admin_users
            WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN');

            IF existing_count >= 3 THEN
              RAISE EXCEPTION
                'All three fixed Main Admin positions are occupied.';
            END IF;
          END IF;

        ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
          IF NEW.role IN ('SUPER_ADMIN', 'MAIN_ADMIN') THEN
            PERFORM pg_advisory_xact_lock(741852963);

            SELECT COUNT(*) INTO existing_count
            FROM admin_users
            WHERE role IN ('SUPER_ADMIN', 'MAIN_ADMIN')
              AND id <> OLD.id;

            IF existing_count >= 3 THEN
              RAISE EXCEPTION
                'All three fixed Main Admin positions are occupied.';
            END IF;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS enforce_main_admin_limit_trigger
      ON admin_users;
    `);

    await client.query(`
      CREATE TRIGGER enforce_main_admin_limit_trigger
      BEFORE INSERT OR UPDATE OF role ON admin_users
      FOR EACH ROW
      EXECUTE FUNCTION enforce_main_admin_limit();
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
