-- Local PostgreSQL initialization script for Standard architecture development.
-- Mounted at /docker-entrypoint-initdb.d/01-init.sql by compose.yaml.
--
-- Security model (least-privilege schema isolation + RLS enforcement):
--   - migrator  : Schema owner used exclusively for DDL / sqlx migrations.
--   - auth_user : Better Auth BFF role with access strictly limited to `auth`.
--   - app_user  : Rust API runtime role (NOBYPASSRLS) with DML-only access
--                 strictly limited to `app`.
--
-- NOTE: Passwords below are local-development-only dummy values and must NEVER
-- be used in staging or production environments.

-- 1. Harden the default `public` schema so non-owners cannot create objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 2. Create isolated schemas owned by `migrator`.
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION migrator;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION migrator;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

-- 3. Create least-privilege runtime roles (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_user') THEN
    CREATE ROLE auth_user
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD 'local-dev-auth-password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD 'local-dev-app-password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE app TO auth_user, app_user;

-- 4. Pin per-role search_path to each role's isolated schema.
ALTER ROLE auth_user IN DATABASE app SET search_path = auth;
ALTER ROLE app_user IN DATABASE app SET search_path = app;

-- 5. Grant `auth_user` privileges on `auth` schema ONLY (zero access to `app`).
GRANT USAGE, CREATE ON SCHEMA auth TO auth_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO auth_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA auth TO auth_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA auth
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO auth_user;

-- 6. Grant `app_user` DML privileges on `app` schema ONLY (zero access to `auth`).
GRANT USAGE ON SCHEMA app TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
