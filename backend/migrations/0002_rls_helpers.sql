CREATE OR REPLACE FUNCTION app_actor_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.actor_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.role', true), '')
$$;

CREATE OR REPLACE FUNCTION app_organization_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.organization_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_scope_schedule_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.scope_schedule_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_scope_student_key()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.scope_student_key', true), '')
$$;

CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_role() = 'admin'
$$;

CREATE OR REPLACE FUNCTION app_has_exam_role(target_exam_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    owner_match boolean := false;
    membership_match boolean := false;
BEGIN
    IF app_is_admin() THEN
        RETURN true;
    END IF;

    IF to_regclass('public.exam_entities') IS NULL OR to_regclass('public.exam_memberships') IS NULL THEN
        RETURN false;
    END IF;

    EXECUTE
        'SELECT EXISTS (
            SELECT 1
            FROM exam_entities
            WHERE id = $1 AND owner_id = $2
        )'
    INTO owner_match
    USING target_exam_id, app_actor_id();

    IF owner_match THEN
        RETURN true;
    END IF;

    EXECUTE
        'SELECT EXISTS (
            SELECT 1
            FROM exam_memberships
            WHERE exam_id = $1
              AND actor_id = $2
              AND role = ANY($3)
              AND revoked_at IS NULL
        )'
    INTO membership_match
    USING target_exam_id, app_actor_id(), allowed_roles;

    RETURN membership_match;
END;
$$;

GRANT EXECUTE ON FUNCTION app_actor_id() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_role() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_organization_id() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_scope_schedule_id() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_scope_student_key() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_is_admin() TO app_migrator, app_runtime, app_worker, app_readonly;
GRANT EXECUTE ON FUNCTION app_has_exam_role(uuid, text[]) TO app_migrator, app_runtime, app_worker, app_readonly;
