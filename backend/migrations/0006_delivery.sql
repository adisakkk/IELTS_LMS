-- Student delivery tables

CREATE TABLE IF NOT EXISTS student_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    registration_id uuid REFERENCES schedule_registrations(id) ON DELETE SET NULL,
    student_key text NOT NULL,
    organization_id text,
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    published_version_id uuid NOT NULL REFERENCES exam_versions(id),
    exam_title text NOT NULL,
    candidate_id text NOT NULL,
    candidate_name text NOT NULL,
    candidate_email text NOT NULL,
    phase text NOT NULL CHECK (phase IN ('pre-check', 'lobby', 'exam', 'post-exam')),
    current_module text NOT NULL CHECK (current_module IN ('listening', 'reading', 'writing', 'speaking')),
    current_question_id text,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    writing_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    flags jsonb NOT NULL DEFAULT '{}'::jsonb,
    violations_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
    integrity jsonb NOT NULL DEFAULT '{}'::jsonb,
    recovery jsonb NOT NULL DEFAULT '{}'::jsonb,
    final_submission jsonb,
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0,
    CONSTRAINT student_attempts_schedule_student_key UNIQUE (schedule_id, student_key),
    CONSTRAINT student_attempts_registration_unique UNIQUE (registration_id)
);

CREATE INDEX idx_student_attempts_schedule_phase_updated
    ON student_attempts(schedule_id, phase, updated_at DESC);
CREATE INDEX idx_student_attempts_exam_updated
    ON student_attempts(exam_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS student_attempt_mutations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    attempt_id uuid NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    client_session_id uuid NOT NULL,
    mutation_type text NOT NULL,
    client_mutation_id text NOT NULL,
    mutation_seq bigint NOT NULL,
    payload jsonb NOT NULL,
    client_timestamp timestamptz NOT NULL,
    server_received_at timestamptz NOT NULL DEFAULT now(),
    applied_revision int,
    applied_at timestamptz
) PARTITION BY RANGE (server_received_at);

CREATE TABLE IF NOT EXISTS student_attempt_mutations_default
    PARTITION OF student_attempt_mutations DEFAULT;

CREATE UNIQUE INDEX idx_student_attempt_mutations_default_attempt_session_seq
    ON student_attempt_mutations_default(attempt_id, client_session_id, mutation_seq);
CREATE INDEX idx_student_attempt_mutations_attempt_received
    ON student_attempt_mutations(attempt_id, server_received_at DESC);
CREATE INDEX idx_student_attempt_mutations_schedule_received
    ON student_attempt_mutations(schedule_id, server_received_at DESC);
CREATE INDEX idx_student_attempt_mutations_attempt_session_seq_desc
    ON student_attempt_mutations(attempt_id, client_session_id, mutation_seq DESC);

CREATE TABLE IF NOT EXISTS student_heartbeat_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    attempt_id uuid NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    event_type text NOT NULL CHECK (event_type IN ('heartbeat', 'disconnect', 'reconnect', 'lost')),
    payload jsonb,
    client_timestamp timestamptz NOT NULL,
    server_received_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (server_received_at);

CREATE TABLE IF NOT EXISTS student_heartbeat_events_default
    PARTITION OF student_heartbeat_events DEFAULT;

CREATE INDEX idx_student_heartbeat_events_attempt_received
    ON student_heartbeat_events(attempt_id, server_received_at DESC);
CREATE INDEX idx_student_heartbeat_events_schedule_received
    ON student_heartbeat_events(schedule_id, server_received_at DESC);

GRANT SELECT, INSERT, UPDATE ON student_attempts TO app_runtime;
GRANT SELECT, INSERT ON student_attempt_mutations TO app_runtime;
GRANT SELECT, INSERT ON student_heartbeat_events TO app_runtime;

DROP TRIGGER IF EXISTS trigger_student_attempts_updated_at ON student_attempts;
CREATE TRIGGER trigger_student_attempts_updated_at
    BEFORE UPDATE ON student_attempts
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
