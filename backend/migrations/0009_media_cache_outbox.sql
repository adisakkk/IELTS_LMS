-- Media metadata, shared cache, idempotency, and outbox coordination

CREATE TABLE IF NOT EXISTS media_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind text NOT NULL,
    owner_id text NOT NULL,
    content_type text NOT NULL,
    file_name text NOT NULL,
    upload_status text NOT NULL CHECK (upload_status IN ('pending', 'finalized', 'orphaned', 'deleted')),
    object_key text NOT NULL,
    size_bytes bigint,
    checksum_sha256 text,
    upload_url text NOT NULL,
    download_url text,
    delete_after_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_assets_owner_updated
    ON media_assets(owner_kind, owner_id, updated_at DESC);
CREATE INDEX idx_media_assets_status_updated
    ON media_assets(upload_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_cache_entries (
    cache_key text PRIMARY KEY,
    payload jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 0,
    invalidated_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    actor_id text NOT NULL,
    route_key text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    response_status int NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (actor_id, route_key, idempotency_key)
);

CREATE INDEX idx_idempotency_keys_expires_at
    ON idempotency_keys(expires_at ASC);

CREATE TABLE IF NOT EXISTS outbox_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    aggregate_kind text NOT NULL,
    aggregate_id text NOT NULL,
    revision bigint NOT NULL DEFAULT 0,
    event_family text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    published_at timestamptz,
    publish_attempts int NOT NULL DEFAULT 0,
    last_error text
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS outbox_events_default
    PARTITION OF outbox_events DEFAULT;

CREATE INDEX idx_outbox_events_default_publish_pending
    ON outbox_events_default(published_at, claimed_at, created_at ASC);
CREATE INDEX idx_outbox_events_default_aggregate
    ON outbox_events_default(aggregate_kind, aggregate_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_cache_entries TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO app_runtime;
GRANT SELECT, INSERT ON outbox_events TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox_events TO app_worker;

DROP TRIGGER IF EXISTS trigger_media_assets_updated_at ON media_assets;
CREATE TRIGGER trigger_media_assets_updated_at
    BEFORE UPDATE ON media_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_shared_cache_entries_updated_at ON shared_cache_entries;
CREATE TRIGGER trigger_shared_cache_entries_updated_at
    BEFORE UPDATE ON shared_cache_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();
