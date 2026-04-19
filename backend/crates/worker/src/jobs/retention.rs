use std::time::Instant;

use ielts_backend_infrastructure::{idempotency::IdempotencyRepository, outbox::OutboxRepository};
use sqlx::PgPool;

const CLEANUP_BATCH_LIMIT: i64 = 1000;

#[derive(Debug, Clone, Copy, Default)]
pub struct RetentionRunReport {
    pub cache_rows: u64,
    pub idempotency_rows: u64,
    pub heartbeat_rows: u64,
    pub mutation_rows: u64,
    pub outbox_rows: u64,
    pub duration_ms: u64,
}

impl RetentionRunReport {
    pub fn total_rows(self) -> u64 {
        self.cache_rows
            + self.idempotency_rows
            + self.heartbeat_rows
            + self.mutation_rows
            + self.outbox_rows
    }
}

#[tracing::instrument(skip(pool))]
pub async fn run_once(pool: PgPool) -> Result<RetentionRunReport, sqlx::Error> {
    let started = Instant::now();
    let idempotency = IdempotencyRepository::new(pool.clone());
    let outbox = OutboxRepository::new(pool.clone());

    let cache_rows = sqlx::query(
        r#"
        DELETE FROM shared_cache_entries
        WHERE ctid IN (
            SELECT ctid
            FROM shared_cache_entries
            WHERE (invalidated_at IS NOT NULL AND invalidated_at < now() - interval '24 hours')
               OR (expires_at IS NOT NULL AND expires_at < now() - interval '24 hours')
            ORDER BY COALESCE(invalidated_at, expires_at) ASC NULLS LAST
            LIMIT $1
        )
        "#,
    )
    .bind(CLEANUP_BATCH_LIMIT)
    .execute(&pool)
    .await?
    .rows_affected();
    let idempotency_rows = idempotency.purge_expired(CLEANUP_BATCH_LIMIT).await?;
    let heartbeat_rows = sqlx::query(
        r#"
        DELETE FROM student_heartbeat_events
        WHERE ctid IN (
            SELECT heartbeat.ctid
            FROM student_heartbeat_events AS heartbeat
            INNER JOIN exam_schedules AS schedule
                ON schedule.id = heartbeat.schedule_id
            WHERE heartbeat.server_received_at < now() - interval '7 days'
              AND schedule.status <> 'live'
            ORDER BY heartbeat.server_received_at ASC
            LIMIT $1
        )
        "#,
    )
    .bind(CLEANUP_BATCH_LIMIT)
    .execute(&pool)
    .await?
    .rows_affected();
    let mutation_rows = sqlx::query(
        r#"
        DELETE FROM student_attempt_mutations
        WHERE ctid IN (
            SELECT mutation.ctid
            FROM student_attempt_mutations AS mutation
            INNER JOIN student_attempts AS attempt
                ON attempt.id = mutation.attempt_id
            INNER JOIN exam_schedules AS schedule
                ON schedule.id = mutation.schedule_id
            WHERE COALESCE(mutation.applied_at, mutation.server_received_at) < now() - interval '30 days'
              AND (
                  attempt.submitted_at IS NOT NULL
                  OR schedule.status IN ('completed', 'cancelled')
              )
            ORDER BY COALESCE(mutation.applied_at, mutation.server_received_at) ASC
            LIMIT $1
        )
        "#,
    )
    .bind(CLEANUP_BATCH_LIMIT)
    .execute(&pool)
    .await?
    .rows_affected();
    let outbox_rows = outbox.purge_published(CLEANUP_BATCH_LIMIT).await?;

    Ok(RetentionRunReport {
        cache_rows,
        idempotency_rows,
        heartbeat_rows,
        mutation_rows,
        outbox_rows,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}
