-- Application domain tables, strict tenant Row-Level Security (RLS), and
-- SECURITY DEFINER membership helpers in the isolated `app` schema.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app'
  ) THEN
    CREATE SCHEMA app;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS app.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE,
  is_personal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_memberships_user_id_idx
  ON app.tenant_memberships (user_id);

CREATE TABLE IF NOT EXISTS app.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todos_tenant_created_at_idx
  ON app.todos (tenant_id, created_at DESC, id DESC);

-- Enable AND force Row-Level Security on all tenant-scoped tables.
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE app.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE app.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.todos FORCE ROW LEVEL SECURITY;

-- Fail-closed tenant isolation policies bound to transaction-local `app.current_tenant_id`.
DROP POLICY IF EXISTS tenants_tenant_isolation ON app.tenants;
CREATE POLICY tenants_tenant_isolation ON app.tenants
  AS PERMISSIVE
  FOR ALL
  USING (id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON app.tenant_memberships;
CREATE POLICY tenant_memberships_tenant_isolation ON app.tenant_memberships
  AS PERMISSIVE
  FOR ALL
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS todos_tenant_isolation ON app.todos;
CREATE POLICY todos_tenant_isolation ON app.todos
  AS PERMISSIVE
  FOR ALL
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Allow the migration owner role (used solely by the SECURITY DEFINER membership
-- helpers below, never by runtime connections) to read/bootstrap tenant metadata
-- even when running as a non-superuser role (e.g. Cloud SQL migrator_user).
-- Intentionally NOT granted on `app.todos`.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenants_migrator_definer_access ON app.tenants';
  EXECUTE format(
    'CREATE POLICY tenants_migrator_definer_access ON app.tenants AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    current_user
  );

  EXECUTE 'DROP POLICY IF EXISTS tenant_memberships_migrator_definer_access ON app.tenant_memberships';
  EXECUTE format(
    'CREATE POLICY tenant_memberships_migrator_definer_access ON app.tenant_memberships AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    current_user
  );
END
$$;

-- Idempotently ensure a personal tenant exists for `p_user_id`.
-- Uses a transaction-scoped advisory lock per user to remain safe under concurrency.
CREATE OR REPLACE FUNCTION app.ensure_personal_tenant(
  p_user_id text,
  p_display_name text,
  p_email text
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  role text,
  is_personal boolean,
  created_at timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_user_id text;
  v_name text;
  v_tenant_id uuid;
  v_slug text;
  v_created_at timestamptz;
BEGIN
  v_user_id := nullif(btrim(COALESCE(p_user_id, '')), '');
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id must not be empty' USING ERRCODE = '22023';
  END IF;

  -- Serialize personal-tenant creation for the same user across concurrent requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('ensure_personal_tenant:' || v_user_id, 0));

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    tm.role,
    t.is_personal,
    t.created_at,
    false AS created
  FROM app.tenants AS t
  INNER JOIN app.tenant_memberships AS tm
    ON tm.tenant_id = t.id
  WHERE tm.user_id = v_user_id
    AND t.is_personal = true
  ORDER BY t.created_at ASC, t.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  v_name := left(
    COALESCE(
      nullif(btrim(COALESCE(p_display_name, '')), ''),
      nullif(split_part(btrim(COALESCE(p_email, '')), '@', 1), ''),
      'Personal Workspace'
    ),
    120
  );

  v_tenant_id := gen_random_uuid();
  v_slug := 'personal-' || replace(v_tenant_id::text, '-', '');

  INSERT INTO app.tenants (id, name, slug, is_personal)
  VALUES (v_tenant_id, v_name, v_slug, true)
  RETURNING app.tenants.created_at INTO v_created_at;

  INSERT INTO app.tenant_memberships (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_user_id, 'owner');

  RETURN QUERY
  SELECT
    v_tenant_id,
    v_name,
    v_slug,
    'owner'::text,
    true,
    v_created_at,
    true;
END;
$$;

-- List all tenants accessible to `p_user_id`, personal workspace first.
CREATE OR REPLACE FUNCTION app.list_user_tenants(
  p_user_id text
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  role text,
  is_personal boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    tm.role,
    t.is_personal,
    t.created_at
  FROM app.tenants AS t
  INNER JOIN app.tenant_memberships AS tm
    ON tm.tenant_id = t.id
  WHERE tm.user_id = nullif(btrim(COALESCE(p_user_id, '')), '')
  ORDER BY t.is_personal DESC, t.created_at ASC, t.id ASC;
$$;

-- Resolve and verify a caller's tenant membership.
-- If `p_requested_tenant_id` is provided and the user is NOT a member, returns 0 rows.
-- If `p_requested_tenant_id` is NULL, resolves the user's personal (or earliest) tenant.
CREATE OR REPLACE FUNCTION app.resolve_user_tenant(
  p_user_id text,
  p_requested_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  role text,
  is_personal boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    tm.role,
    t.is_personal,
    t.created_at
  FROM app.tenants AS t
  INNER JOIN app.tenant_memberships AS tm
    ON tm.tenant_id = t.id
  WHERE tm.user_id = nullif(btrim(COALESCE(p_user_id, '')), '')
    AND (p_requested_tenant_id IS NULL OR t.id = p_requested_tenant_id)
  ORDER BY t.is_personal DESC, t.created_at ASC, t.id ASC
  LIMIT 1;
$$;

-- Lock down SECURITY DEFINER functions to least-privilege API runtime roles only.
REVOKE ALL ON FUNCTION app.ensure_personal_tenant(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_user_tenants(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_user_tenant(text, uuid) FROM PUBLIC;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['app_user', 'api_user']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', v_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO %I', v_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION app.ensure_personal_tenant(text, text, text) TO %I', v_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION app.list_user_tenants(text) TO %I', v_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION app.resolve_user_tenant(text, uuid) TO %I', v_role);
    END IF;
  END LOOP;
END
$$;
