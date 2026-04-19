-- Exam core tables: exam_entities, exam_memberships, exam_versions, exam_events

-- exam_entities
CREATE TABLE IF NOT EXISTS exam_entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    title text NOT NULL,
    exam_type text NOT NULL CHECK (exam_type IN ('Academic', 'General Training')),
    status text NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'scheduled', 'published', 'archived', 'unpublished')),
    visibility text NOT NULL CHECK (visibility IN ('private', 'organization', 'public')),
    organization_id text,
    owner_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    archived_at timestamptz,
    current_draft_version_id uuid,
    current_published_version_id uuid,
    total_questions int,
    total_reading_questions int,
    total_listening_questions int,
    schema_version int NOT NULL DEFAULT 1,
    revision int NOT NULL DEFAULT 0
);

-- Indexes for exam_entities
CREATE UNIQUE INDEX idx_exam_entities_slug ON exam_entities(slug);
CREATE INDEX idx_exam_entities_org_status_updated ON exam_entities(organization_id, status, updated_at DESC);
CREATE INDEX idx_exam_entities_owner_updated ON exam_entities(owner_id, updated_at DESC);
CREATE INDEX idx_exam_entities_draft_version ON exam_entities(current_draft_version_id) WHERE current_draft_version_id IS NOT NULL;

-- exam_memberships
CREATE TABLE IF NOT EXISTS exam_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'reviewer', 'grader')),
    granted_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

-- Constraints and indexes for exam_memberships
CREATE UNIQUE INDEX idx_exam_memberships_exam_actor_role_active 
    ON exam_memberships(exam_id, actor_id, role) 
    WHERE revoked_at IS NULL;
CREATE INDEX idx_exam_memberships_actor_role_created 
    ON exam_memberships(actor_id, role, created_at DESC) 
    WHERE revoked_at IS NULL;

-- exam_versions
CREATE TABLE IF NOT EXISTS exam_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    version_number int NOT NULL,
    parent_version_id uuid REFERENCES exam_versions(id),
    content_snapshot jsonb NOT NULL,
    config_snapshot jsonb NOT NULL,
    validation_snapshot jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    publish_notes text,
    is_draft boolean NOT NULL DEFAULT false,
    is_published boolean NOT NULL DEFAULT false,
    revision int NOT NULL DEFAULT 0,
    CONSTRAINT exam_versions_exam_version_number UNIQUE (exam_id, version_number)
);

-- Indexes for exam_versions
CREATE INDEX idx_exam_versions_exam_created ON exam_versions(exam_id, created_at DESC);
CREATE INDEX idx_exam_versions_exam_draft ON exam_versions(exam_id, is_draft);
CREATE INDEX idx_exam_versions_exam_published ON exam_versions(exam_id, is_published);
CREATE INDEX idx_exam_versions_parent ON exam_versions(parent_version_id);

-- exam_events (append-only)
CREATE TABLE IF NOT EXISTS exam_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES exam_entities(id) ON DELETE CASCADE,
    version_id uuid REFERENCES exam_versions(id),
    actor_id text NOT NULL,
    action text NOT NULL CHECK (action IN (
        'created', 'draft_saved', 'submitted_for_review', 'approved', 'rejected', 
        'published', 'unpublished', 'scheduled', 'archived', 'restored', 
        'cloned', 'version_created', 'version_restored', 'permissions_updated'
    )),
    from_state text,
    to_state text,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for exam_events
CREATE INDEX idx_exam_events_exam_created ON exam_events(exam_id, created_at DESC);
CREATE INDEX idx_exam_events_exam_action_created ON exam_events(exam_id, action, created_at DESC);

-- Enable RLS
ALTER TABLE exam_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exam_entities
CREATE POLICY exam_entities_read ON exam_entities
    FOR SELECT
    USING (
        app_is_admin() 
        OR app_has_exam_role(id, ARRAY['owner','reviewer','grader']) 
        OR (status = 'published' AND visibility = 'public')
        OR (status = 'published' AND visibility = 'organization' AND organization_id IS NOT DISTINCT FROM app_organization_id())
    );

CREATE POLICY exam_entities_write ON exam_entities
    FOR ALL
    USING (
        app_is_admin() 
        OR app_has_exam_role(id, ARRAY['owner','reviewer'])
    );

-- RLS Policies for exam_versions
CREATE POLICY exam_versions_read ON exam_versions
    FOR SELECT
    USING (
        app_is_admin() 
        OR app_has_exam_role(exam_id, ARRAY['owner','reviewer','grader'])
        OR EXISTS (
            SELECT 1 FROM exam_entities e 
            WHERE e.id = exam_id 
            AND e.status = 'published' 
            AND (e.visibility = 'public' OR (e.visibility = 'organization' AND e.organization_id IS NOT DISTINCT FROM app_organization_id()))
        )
    );

CREATE POLICY exam_versions_write ON exam_versions
    FOR ALL
    USING (
        app_is_admin() 
        OR app_has_exam_role(exam_id, ARRAY['owner','reviewer'])
    );

-- RLS Policies for exam_memberships
CREATE POLICY exam_memberships_read ON exam_memberships
    FOR SELECT
    USING (app_is_admin() OR app_has_exam_role(exam_id, ARRAY['owner']));

CREATE POLICY exam_memberships_write ON exam_memberships
    FOR ALL
    USING (app_is_admin() OR app_has_exam_role(exam_id, ARRAY['owner']));

-- RLS Policies for exam_events (append-only, no UPDATE)
CREATE POLICY exam_events_read ON exam_events
    FOR SELECT
    USING (
        app_is_admin() 
        OR app_has_exam_role(exam_id, ARRAY['owner','reviewer','grader'])
        OR EXISTS (
            SELECT 1 FROM exam_entities e 
            WHERE e.id = exam_id 
            AND e.status = 'published' 
            AND (e.visibility = 'public' OR (e.visibility = 'organization' AND e.organization_id IS NOT DISTINCT FROM app_organization_id()))
        )
    );

CREATE POLICY exam_events_insert ON exam_events
    FOR INSERT
    WITH CHECK (
        app_is_admin() 
        OR app_has_exam_role(exam_id, ARRAY['owner','reviewer'])
    );

-- Grants to app_runtime
GRANT SELECT, INSERT, UPDATE ON exam_entities TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON exam_memberships TO app_runtime;
GRANT SELECT, INSERT ON exam_versions TO app_runtime;
GRANT SELECT ON exam_events TO app_runtime;

-- Sequence for version numbers
CREATE SEQUENCE IF NOT EXISTS exam_version_number_seq;

-- Function to get next version number for an exam
CREATE OR REPLACE FUNCTION get_next_exam_version_number(p_exam_id uuid)
RETURNS int
LANGUAGE sql
AS $$
    SELECT COALESCE(MAX(version_number), 0) + 1
    FROM exam_versions
    WHERE exam_id = p_exam_id;
$$;

-- Trigger to updated updated_at on exam_entities
CREATE OR REPLACE FUNCTION update_exam_entities_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_exam_entities_updated_at
    BEFORE UPDATE ON exam_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_entities_updated_at();
