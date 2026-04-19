-- First-party identity, sessions, and attempt-scoped execution credentials

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    display_name text,
    role text NOT NULL CHECK (role IN ('admin', 'builder', 'proctor', 'grader', 'student')),
    state text NOT NULL CHECK (state IN ('active', 'disabled', 'locked', 'pending_activation')),
    failed_login_count int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_password_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash text NOT NULL UNIQUE,
    csrf_token text NOT NULL,
    role_snapshot text NOT NULL CHECK (role_snapshot IN ('admin', 'builder', 'proctor', 'grader', 'student')),
    issued_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    idle_timeout_at timestamptz NOT NULL,
    user_agent_hash text,
    ip_metadata jsonb,
    revoked_at timestamptz,
    revocation_reason text
);

CREATE INDEX idx_user_sessions_user_active
    ON user_sessions(user_id, expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_session_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_session_events_session_created
    ON user_session_events(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_expires
    ON password_reset_tokens(expires_at ASC);

CREATE TABLE IF NOT EXISTS account_activation_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_activation_tokens_expires
    ON account_activation_tokens(expires_at ASC);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student_id text NOT NULL,
    full_name text NOT NULL,
    email text,
    institution text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_student_profiles_student_id
    ON student_profiles(student_id);

CREATE TABLE IF NOT EXISTS staff_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    staff_code text,
    full_name text NOT NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempt_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    attempt_id uuid NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    client_session_id uuid NOT NULL,
    token_id text NOT NULL UNIQUE,
    device_fingerprint_hash text,
    issued_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revocation_reason text,
    CONSTRAINT attempt_sessions_attempt_client_unique UNIQUE (attempt_id, client_session_id)
);

CREATE INDEX idx_attempt_sessions_user_active
    ON attempt_sessions(user_id, schedule_id, expires_at DESC)
    WHERE revoked_at IS NULL;

ALTER TABLE schedule_registrations
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE schedule_staff_assignments
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE student_attempts
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_registrations_schedule_user_active
    ON schedule_registrations(schedule_id, user_id)
    WHERE user_id IS NOT NULL AND access_state <> 'withdrawn';

CREATE INDEX IF NOT EXISTS idx_schedule_staff_assignments_user_role_created
    ON schedule_staff_assignments(user_id, role, created_at DESC)
    WHERE revoked_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_attempts_schedule_user
    ON student_attempts(schedule_id, user_id, updated_at DESC)
    WHERE user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_password_credentials TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_session_events TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_activation_tokens TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_profiles TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_profiles TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON attempt_sessions TO app_runtime;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trigger_student_profiles_updated_at
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_staff_profiles_updated_at ON staff_profiles;
CREATE TRIGGER trigger_staff_profiles_updated_at
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
