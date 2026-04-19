-- Grading, submissions, and released results

CREATE TABLE IF NOT EXISTS grading_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL UNIQUE REFERENCES exam_schedules(id) ON DELETE CASCADE,
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    exam_title text NOT NULL,
    published_version_id uuid NOT NULL REFERENCES exam_versions(id),
    cohort_name text NOT NULL,
    institution text,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('scheduled', 'live', 'in_progress', 'completed', 'cancelled')),
    total_students int NOT NULL DEFAULT 0,
    submitted_count int NOT NULL DEFAULT 0,
    pending_manual_reviews int NOT NULL DEFAULT 0,
    in_progress_reviews int NOT NULL DEFAULT 0,
    finalized_reviews int NOT NULL DEFAULT 0,
    overdue_reviews int NOT NULL DEFAULT 0,
    assigned_teachers jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id uuid NOT NULL UNIQUE REFERENCES student_attempts(id) ON DELETE CASCADE,
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    published_version_id uuid NOT NULL REFERENCES exam_versions(id),
    student_id text NOT NULL,
    student_name text NOT NULL,
    student_email text,
    cohort_name text NOT NULL,
    submitted_at timestamptz NOT NULL,
    time_spent_seconds int NOT NULL DEFAULT 0,
    grading_status text NOT NULL CHECK (grading_status IN ('not_submitted', 'submitted', 'in_progress', 'grading_complete', 'ready_to_release', 'released', 'reopened')),
    assigned_teacher_id text,
    assigned_teacher_name text,
    is_flagged boolean NOT NULL DEFAULT false,
    flag_reason text,
    is_overdue boolean NOT NULL DEFAULT false,
    due_date timestamptz,
    section_statuses jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_submissions_schedule_submitted
    ON student_submissions(schedule_id, submitted_at DESC);
CREATE INDEX idx_student_submissions_status_updated
    ON student_submissions(grading_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS section_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    section text NOT NULL CHECK (section IN ('listening', 'reading', 'writing', 'speaking')),
    answers jsonb NOT NULL,
    auto_grading_results jsonb,
    grading_status text NOT NULL CHECK (grading_status IN ('pending', 'auto_graded', 'needs_review', 'in_review', 'finalized', 'reopened')),
    reviewed_by text,
    reviewed_at timestamptz,
    finalized_by text,
    finalized_at timestamptz,
    submitted_at timestamptz NOT NULL,
    CONSTRAINT section_submissions_submission_section UNIQUE (submission_id, section)
);

CREATE TABLE IF NOT EXISTS writing_task_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_submission_id uuid NOT NULL REFERENCES section_submissions(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    task_id text NOT NULL,
    task_label text NOT NULL,
    prompt text NOT NULL,
    student_text text NOT NULL,
    word_count int NOT NULL DEFAULT 0,
    rubric_assessment jsonb,
    annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
    overall_feedback text,
    student_visible_notes text,
    grading_status text NOT NULL CHECK (grading_status IN ('pending', 'auto_graded', 'needs_review', 'in_review', 'finalized', 'reopened')),
    submitted_at timestamptz NOT NULL,
    graded_by text,
    graded_at timestamptz,
    finalized_by text,
    finalized_at timestamptz,
    CONSTRAINT writing_task_submissions_task_unique UNIQUE (section_submission_id, task_id)
);

CREATE TABLE IF NOT EXISTS review_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL UNIQUE REFERENCES student_submissions(id) ON DELETE CASCADE,
    student_id text NOT NULL,
    teacher_id text NOT NULL,
    release_status text NOT NULL CHECK (release_status IN ('draft', 'grading_complete', 'ready_to_release', 'released', 'reopened')),
    section_drafts jsonb NOT NULL DEFAULT '{}'::jsonb,
    annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
    drawings jsonb NOT NULL DEFAULT '[]'::jsonb,
    overall_feedback text,
    student_visible_notes text,
    internal_notes text,
    teacher_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
    has_unsaved_changes boolean NOT NULL DEFAULT false,
    last_auto_save_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS review_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    teacher_id text NOT NULL,
    teacher_name text NOT NULL,
    action text NOT NULL CHECK (action IN ('review_started', 'review_assigned', 'draft_saved', 'comment_added', 'comment_updated', 'rubric_updated', 'review_finalized', 'review_reopened', 'score_override', 'feedback_updated', 'release_now', 'mark_ready_to_release')),
    section text,
    task_id text,
    annotation_id text,
    question_id text,
    from_status text,
    to_status text,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_events_submission_created
    ON review_events(submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    student_id text NOT NULL,
    student_name text NOT NULL,
    release_status text NOT NULL CHECK (release_status IN ('draft', 'grading_complete', 'ready_to_release', 'released', 'reopened')),
    released_at timestamptz,
    released_by text,
    scheduled_release_date timestamptz,
    overall_band double precision NOT NULL DEFAULT 0,
    section_bands jsonb NOT NULL DEFAULT '{}'::jsonb,
    listening_result jsonb,
    reading_result jsonb,
    writing_results jsonb NOT NULL DEFAULT '{}'::jsonb,
    speaking_result jsonb,
    teacher_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    version int NOT NULL DEFAULT 1,
    previous_version_id uuid REFERENCES student_results(id) ON DELETE SET NULL,
    revision_reason text,
    authorized_actor_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_results_submission_updated
    ON student_results(submission_id, updated_at DESC);
CREATE INDEX idx_student_results_release_status_updated
    ON student_results(release_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS release_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id uuid NOT NULL REFERENCES student_results(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    action text NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_release_events_result_created
    ON release_events(result_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON grading_sessions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON student_submissions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON section_submissions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON writing_task_submissions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON review_drafts TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON review_events TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON student_results TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON release_events TO app_runtime;

DROP TRIGGER IF EXISTS trigger_grading_sessions_updated_at ON grading_sessions;
CREATE TRIGGER trigger_grading_sessions_updated_at
    BEFORE UPDATE ON grading_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_student_submissions_updated_at ON student_submissions;
CREATE TRIGGER trigger_student_submissions_updated_at
    BEFORE UPDATE ON student_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_review_drafts_updated_at ON review_drafts;
CREATE TRIGGER trigger_review_drafts_updated_at
    BEFORE UPDATE ON review_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_student_results_updated_at ON student_results;
CREATE TRIGGER trigger_student_results_updated_at
    BEFORE UPDATE ON student_results
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
