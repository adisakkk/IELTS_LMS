-- Proctoring coordination and audit tables

ALTER TABLE student_attempts
    ADD COLUMN IF NOT EXISTS proctor_status text NOT NULL DEFAULT 'active'
        CHECK (proctor_status IN ('active', 'warned', 'paused', 'terminated', 'idle', 'connecting')),
    ADD COLUMN IF NOT EXISTS proctor_note text,
    ADD COLUMN IF NOT EXISTS proctor_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS proctor_updated_by text,
    ADD COLUMN IF NOT EXISTS last_warning_id text,
    ADD COLUMN IF NOT EXISTS last_acknowledged_warning_id text;

CREATE TABLE IF NOT EXISTS student_violation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    attempt_id uuid NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    violation_type text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description text NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_violation_events_schedule_created
    ON student_violation_events(schedule_id, created_at DESC);
CREATE INDEX idx_student_violation_events_attempt_created
    ON student_violation_events(attempt_id, created_at DESC);

CREATE TABLE IF NOT EXISTS proctor_presence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    proctor_id text NOT NULL,
    proctor_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'left')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
    left_at timestamptz
);

CREATE UNIQUE INDEX idx_proctor_presence_active
    ON proctor_presence(schedule_id, proctor_id)
    WHERE left_at IS NULL;
CREATE INDEX idx_proctor_presence_schedule_heartbeat
    ON proctor_presence(schedule_id, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS session_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    actor text NOT NULL,
    action_type text NOT NULL,
    target_student_id uuid REFERENCES student_attempts(id) ON DELETE SET NULL,
    payload jsonb,
    acknowledged_at timestamptz,
    acknowledged_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_audit_logs_schedule_created
    ON session_audit_logs(schedule_id, created_at DESC);
CREATE INDEX idx_session_audit_logs_target_created
    ON session_audit_logs(target_student_id, created_at DESC)
    WHERE target_student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    author text NOT NULL,
    category text NOT NULL CHECK (category IN ('general', 'incident', 'handover')),
    content text NOT NULL,
    is_resolved boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_notes_schedule_created
    ON session_notes(schedule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS violation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    trigger_type text NOT NULL CHECK (trigger_type IN ('violation_count', 'specific_violation_type', 'severity_threshold')),
    threshold int NOT NULL CHECK (threshold > 0),
    specific_violation_type text,
    specific_severity text CHECK (specific_severity IN ('low', 'medium', 'high', 'critical')),
    action text NOT NULL CHECK (action IN ('warn', 'pause', 'notify_proctor', 'terminate')),
    is_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL
);

CREATE INDEX idx_violation_rules_schedule_created
    ON violation_rules(schedule_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON student_violation_events TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON proctor_presence TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON session_audit_logs TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON session_notes TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON violation_rules TO app_runtime;

DROP TRIGGER IF EXISTS trigger_session_notes_updated_at ON session_notes;
CREATE TRIGGER trigger_session_notes_updated_at
    BEFORE UPDATE ON session_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
