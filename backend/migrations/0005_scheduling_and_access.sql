-- Scheduling and runtime tables

CREATE TABLE IF NOT EXISTS exam_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    organization_id text,
    exam_title text NOT NULL,
    published_version_id uuid NOT NULL REFERENCES exam_versions(id),
    cohort_name text NOT NULL,
    institution text,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    planned_duration_minutes int NOT NULL,
    delivery_mode text NOT NULL CHECK (delivery_mode = 'proctor_start'),
    recurrence_type text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_interval int NOT NULL DEFAULT 1 CHECK (recurrence_interval > 0),
    recurrence_end_date date,
    buffer_before_minutes int,
    buffer_after_minutes int,
    auto_start boolean NOT NULL DEFAULT false,
    auto_stop boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

CREATE INDEX idx_exam_schedules_org_status_start ON exam_schedules(organization_id, status, start_time ASC);
CREATE INDEX idx_exam_schedules_exam_start ON exam_schedules(exam_id, start_time DESC);
CREATE INDEX idx_exam_schedules_version ON exam_schedules(published_version_id);

CREATE TABLE IF NOT EXISTS schedule_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    student_key text NOT NULL,
    actor_id text,
    student_id text NOT NULL,
    student_name text NOT NULL,
    student_email text,
    access_state text NOT NULL CHECK (access_state IN ('invited', 'checked_in', 'withdrawn', 'blocked', 'submitted')),
    allowed_from timestamptz,
    allowed_until timestamptz,
    extra_time_minutes int NOT NULL DEFAULT 0,
    seat_label text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0,
    CONSTRAINT schedule_registrations_schedule_student_key UNIQUE (schedule_id, student_key)
);

CREATE UNIQUE INDEX idx_schedule_registrations_schedule_actor_active
    ON schedule_registrations(schedule_id, actor_id)
    WHERE actor_id IS NOT NULL;
CREATE INDEX idx_schedule_registrations_schedule_access_updated
    ON schedule_registrations(schedule_id, access_state, updated_at DESC);
CREATE INDEX idx_schedule_registrations_actor_updated
    ON schedule_registrations(actor_id, updated_at DESC)
    WHERE actor_id IS NOT NULL;
CREATE INDEX idx_schedule_registrations_student_updated
    ON schedule_registrations(student_id, updated_at DESC)
    WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS schedule_staff_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('proctor', 'grader', 'admin_observer')),
    granted_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE UNIQUE INDEX idx_schedule_staff_assignments_active
    ON schedule_staff_assignments(schedule_id, actor_id, role)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_schedule_staff_assignments_actor_role_created
    ON schedule_staff_assignments(actor_id, role, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS exam_session_runtimes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL UNIQUE REFERENCES exam_schedules(id) ON DELETE CASCADE,
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('not_started', 'live', 'paused', 'completed', 'cancelled')),
    plan_snapshot jsonb NOT NULL,
    actual_start_at timestamptz,
    actual_end_at timestamptz,
    active_section_key text,
    current_section_key text,
    current_section_remaining_seconds int NOT NULL DEFAULT 0,
    waiting_for_next_section boolean NOT NULL DEFAULT false,
    is_overrun boolean NOT NULL DEFAULT false,
    total_paused_seconds int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_session_runtime_sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    runtime_id uuid NOT NULL REFERENCES exam_session_runtimes(id) ON DELETE CASCADE,
    section_key text NOT NULL CHECK (section_key IN ('listening', 'reading', 'writing', 'speaking')),
    label text NOT NULL,
    section_order int NOT NULL,
    planned_duration_minutes int NOT NULL,
    gap_after_minutes int NOT NULL DEFAULT 0,
    status text NOT NULL CHECK (status IN ('locked', 'live', 'paused', 'completed')),
    available_at timestamptz,
    actual_start_at timestamptz,
    actual_end_at timestamptz,
    paused_at timestamptz,
    accumulated_paused_seconds int NOT NULL DEFAULT 0,
    extension_minutes int NOT NULL DEFAULT 0,
    completion_reason text,
    projected_start_at timestamptz,
    projected_end_at timestamptz,
    CONSTRAINT runtime_sections_runtime_section_key UNIQUE (runtime_id, section_key)
);

CREATE INDEX idx_runtime_sections_runtime_order
    ON exam_session_runtime_sections(runtime_id, section_order);

CREATE TABLE IF NOT EXISTS cohort_control_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    runtime_id uuid NOT NULL REFERENCES exam_session_runtimes(id) ON DELETE CASCADE,
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('start_runtime', 'pause_runtime', 'resume_runtime', 'extend_section', 'end_section_now', 'complete_runtime', 'auto_timeout')),
    section_key text,
    minutes int,
    reason text,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cohort_control_events_schedule_created
    ON cohort_control_events(schedule_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON exam_schedules TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON schedule_registrations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON schedule_staff_assignments TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON exam_session_runtimes TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON exam_session_runtime_sections TO app_runtime;
GRANT SELECT, INSERT ON cohort_control_events TO app_runtime;

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_exam_schedules_updated_at ON exam_schedules;
CREATE TRIGGER trigger_exam_schedules_updated_at
    BEFORE UPDATE ON exam_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_schedule_registrations_updated_at ON schedule_registrations;
CREATE TRIGGER trigger_schedule_registrations_updated_at
    BEFORE UPDATE ON schedule_registrations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_exam_session_runtimes_updated_at ON exam_session_runtimes;
CREATE TRIGGER trigger_exam_session_runtimes_updated_at
    BEFORE UPDATE ON exam_session_runtimes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
