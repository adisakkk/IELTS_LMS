use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

/// Create a test exam entity with basic defaults.
pub async fn create_test_exam(
    pool: &PgPool,
    owner_id: &str,
    title: &str,
) -> Result<Uuid, sqlx::Error> {
    let exam_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO exam_entities (
            id, owner_id, title, status, visibility, organization_id,
            current_draft_version_id, current_published_version_id,
            created_at, updated_at
        )
        VALUES ($1, $2, $3, 'draft', 'private', NULL, NULL, NULL, now(), now())
        "#,
    )
    .bind(exam_id)
    .bind(owner_id)
    .bind(title)
    .execute(pool)
    .await?;
    
    Ok(exam_id)
}

/// Create a test exam version.
pub async fn create_test_version(
    pool: &PgPool,
    exam_id: Uuid,
    version_number: i32,
    payload: serde_json::Value,
) -> Result<Uuid, sqlx::Error> {
    let version_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO exam_versions (
            id, exam_id, version_number, payload, created_at
        )
        VALUES ($1, $2, $3, $4, now())
        "#,
    )
    .bind(version_id)
    .bind(exam_id)
    .bind(version_number)
    .bind(payload)
    .execute(pool)
    .await?;
    
    Ok(version_id)
}

/// Create a test exam schedule.
pub async fn create_test_schedule(
    pool: &PgPool,
    exam_id: Uuid,
    pinned_version_id: Option<Uuid>,
    created_by: &str,
) -> Result<Uuid, sqlx::Error> {
    let schedule_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO exam_schedules (
            id, exam_id, pinned_version_id, status,
            timezone, starts_at, ends_at, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'draft', 'UTC', now(), now() + interval '1 day', $4, now(), now())
        "#,
    )
    .bind(schedule_id)
    .bind(exam_id)
    .bind(pinned_version_id)
    .bind(created_by)
    .execute(pool)
    .await?;
    
    Ok(schedule_id)
}

/// Create a test schedule registration.
pub async fn create_test_registration(
    pool: &PgPool,
    schedule_id: Uuid,
    actor_id: &str,
    student_key: &str,
) -> Result<Uuid, sqlx::Error> {
    let registration_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO schedule_registrations (
            id, schedule_id, actor_id, student_key, display_name,
            precheck_payload, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'Test Student', '{}'::jsonb, now(), now())
        "#,
    )
    .bind(registration_id)
    .bind(schedule_id)
    .bind(actor_id)
    .bind(student_key)
    .execute(pool)
    .await?;
    
    Ok(registration_id)
}

/// Create a test student attempt.
pub async fn create_test_attempt(
    pool: &PgPool,
    schedule_id: Uuid,
    student_key: &str,
    exam_version_id: Uuid,
) -> Result<Uuid, sqlx::Error> {
    let attempt_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO student_attempts (
            id, schedule_id, student_key, exam_version_id,
            started_at, last_mutation_sequence, status,
            created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, now(), 0, 'active', now(), now())
        "#,
    )
    .bind(attempt_id)
    .bind(schedule_id)
    .bind(student_key)
    .bind(exam_version_id)
    .execute(pool)
    .await?;
    
    Ok(attempt_id)
}

/// Create a test passage library item.
pub async fn create_test_passage(
    pool: &PgPool,
    organization_id: Option<&str>,
    title: &str,
    content: &str,
) -> Result<Uuid, sqlx::Error> {
    let passage_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO passage_library_items (
            id, organization_id, title, content, usage_count, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 0, now(), now())
        "#,
    )
    .bind(passage_id)
    .bind(organization_id)
    .bind(title)
    .bind(content)
    .execute(pool)
    .await?;
    
    Ok(passage_id)
}

/// Create a test idempotency key.
pub async fn create_test_idempotency_key(
    pool: &PgPool,
    actor_id: &str,
    route_key: &str,
    idempotency_key: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO idempotency_keys (
            actor_id, route_key, idempotency_key, request_hash,
            response_status, response_body, created_at, expires_at
        )
        VALUES ($1, $2, $3, 'hash123', 200, '{}'::jsonb, now(), now() + interval '72 hours')
        "#,
    )
    .bind(actor_id)
    .bind(route_key)
    .bind(idempotency_key)
    .execute(pool)
    .await?;
    
    Ok(())
}

/// Create a test outbox event.
pub async fn create_test_outbox_event(
    pool: &PgPool,
    aggregate_kind: &str,
    aggregate_id: &str,
    revision: i64,
    event_family: &str,
    payload: serde_json::Value,
) -> Result<Uuid, sqlx::Error> {
    let event_id = Uuid::new_v4();
    
    sqlx::query(
        r#"
        INSERT INTO outbox_events (
            id, aggregate_kind, aggregate_id, revision, event_family, payload,
            created_at, publish_attempts
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), 0)
        "#,
    )
    .bind(event_id)
    .bind(aggregate_kind)
    .bind(aggregate_id)
    .bind(revision)
    .bind(event_family)
    .bind(payload)
    .execute(pool)
    .await?;
    
    Ok(event_id)
}
