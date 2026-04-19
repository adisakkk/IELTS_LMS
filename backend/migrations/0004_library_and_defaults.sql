-- Library and defaults tables: admin_default_profiles, passage_library_items, question_bank_items

-- admin_default_profiles
CREATE TABLE IF NOT EXISTS admin_default_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text,
    profile_name text NOT NULL,
    config_snapshot jsonb NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

-- Constraints and indexes for admin_default_profiles
CREATE UNIQUE INDEX idx_admin_default_profiles_org_active 
    ON admin_default_profiles(organization_id) 
    WHERE is_active IS TRUE;
CREATE INDEX idx_admin_default_profiles_org_updated ON admin_default_profiles(organization_id, updated_at DESC);

-- passage_library_items
CREATE TABLE IF NOT EXISTS passage_library_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text,
    title text NOT NULL,
    passage_snapshot jsonb NOT NULL,
    difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    topic text NOT NULL,
    tags text[] NOT NULL DEFAULT '{}',
    word_count int NOT NULL,
    estimated_time_minutes int NOT NULL,
    usage_count int NOT NULL DEFAULT 0,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

-- Indexes for passage_library_items
CREATE INDEX idx_passage_library_org_difficulty_updated 
    ON passage_library_items(organization_id, difficulty, updated_at DESC);
CREATE INDEX idx_passage_library_tags ON passage_library_items USING GIN(tags);
CREATE INDEX idx_passage_library_search ON passage_library_items USING GIN(
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(topic, '') || ' ' || 
        COALESCE(passage_snapshot::text, '')
    )
);

-- question_bank_items
CREATE TABLE IF NOT EXISTS question_bank_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text,
    question_type text NOT NULL,
    block_snapshot jsonb NOT NULL,
    difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    topic text NOT NULL,
    tags text[] NOT NULL DEFAULT '{}',
    usage_count int NOT NULL DEFAULT 0,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision int NOT NULL DEFAULT 0
);

-- Indexes for question_bank_items
CREATE INDEX idx_question_bank_org_type_difficulty_updated 
    ON question_bank_items(organization_id, question_type, difficulty, updated_at DESC);
CREATE INDEX idx_question_bank_tags ON question_bank_items USING GIN(tags);
CREATE INDEX idx_question_bank_search ON question_bank_items USING GIN(
    to_tsvector('english', 
        COALESCE(topic, '') || ' ' || 
        COALESCE(block_snapshot::text, '')
    )
);

-- Enable RLS
ALTER TABLE admin_default_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE passage_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_default_profiles
CREATE POLICY admin_default_profiles_read ON admin_default_profiles
    FOR SELECT
    USING (app_is_admin());

CREATE POLICY admin_default_profiles_write ON admin_default_profiles
    FOR ALL
    USING (app_is_admin());

-- RLS Policies for passage_library_items
CREATE POLICY passage_library_items_read ON passage_library_items
    FOR SELECT
    USING (
        app_is_admin() 
        OR (organization_id IS NOT DISTINCT FROM app_organization_id() AND app_role() IN ('owner','reviewer'))
    );

CREATE POLICY passage_library_items_write ON passage_library_items
    FOR ALL
    USING (
        app_is_admin() 
        OR (organization_id IS NOT DISTINCT FROM app_organization_id() AND app_role() IN ('owner','reviewer'))
    );

-- RLS Policies for question_bank_items
CREATE POLICY question_bank_items_read ON question_bank_items
    FOR SELECT
    USING (
        app_is_admin() 
        OR (organization_id IS NOT DISTINCT FROM app_organization_id() AND app_role() IN ('owner','reviewer'))
    );

CREATE POLICY question_bank_items_write ON question_bank_items
    FOR ALL
    USING (
        app_is_admin() 
        OR (organization_id IS NOT DISTINCT FROM app_organization_id() AND app_role() IN ('owner','reviewer'))
    );

-- Grants to app_runtime
GRANT SELECT, INSERT, UPDATE ON admin_default_profiles TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON passage_library_items TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON question_bank_items TO app_runtime;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_admin_default_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_admin_default_profiles_updated_at
    BEFORE UPDATE ON admin_default_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_default_profiles_updated_at();

CREATE OR REPLACE FUNCTION update_passage_library_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_passage_library_items_updated_at
    BEFORE UPDATE ON passage_library_items
    FOR EACH ROW
    EXECUTE FUNCTION update_passage_library_items_updated_at();

CREATE OR REPLACE FUNCTION update_question_bank_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_question_bank_items_updated_at
    BEFORE UPDATE ON question_bank_items
    FOR EACH ROW
    EXECUTE FUNCTION update_question_bank_items_updated_at();
