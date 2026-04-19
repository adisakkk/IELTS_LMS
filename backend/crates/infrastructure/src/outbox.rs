use chrono::{DateTime, Utc};
use ielts_backend_domain::schedule::LiveUpdateEvent;
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OutboxEvent {
    pub id: Uuid,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub revision: i64,
    pub event_family: String,
    pub payload: Value,
    pub created_at: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub publish_attempts: i32,
    pub last_error: Option<String>,
}

#[derive(Clone)]
pub struct OutboxRepository {
    pool: PgPool,
}

impl OutboxRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn enqueue(
        &self,
        aggregate_kind: &str,
        aggregate_id: &str,
        revision: i64,
        event_family: &str,
        payload: &Value,
    ) -> Result<OutboxEvent, sqlx::Error> {
        sqlx::query_as::<_, OutboxEvent>(
            r#"
            INSERT INTO outbox_events (
                id, aggregate_kind, aggregate_id, revision, event_family, payload,
                created_at, publish_attempts
            )
            VALUES ($1, $2, $3, $4, $5, $6, now(), 0)
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(aggregate_kind)
        .bind(aggregate_id)
        .bind(revision)
        .bind(event_family)
        .bind(payload)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn enqueue_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        aggregate_kind: &str,
        aggregate_id: &str,
        revision: i64,
        event_family: &str,
        payload: &Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO outbox_events (
                id, aggregate_kind, aggregate_id, revision, event_family, payload,
                created_at, publish_attempts
            )
            VALUES ($1, $2, $3, $4, $5, $6, now(), 0)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(aggregate_kind)
        .bind(aggregate_id)
        .bind(revision)
        .bind(event_family)
        .bind(payload)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    pub async fn claim_batch(&self, limit: i64) -> Result<Vec<OutboxEvent>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let events = sqlx::query_as::<_, OutboxEvent>(
            r#"
            SELECT *
            FROM outbox_events
            WHERE published_at IS NULL
              AND claimed_at IS NULL
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
            "#,
        )
        .bind(limit)
        .fetch_all(&mut *tx)
        .await?;

        if events.is_empty() {
            tx.commit().await?;
            return Ok(Vec::new());
        }

        let ids: Vec<Uuid> = events.iter().map(|event| event.id).collect();
        sqlx::query(
            "UPDATE outbox_events SET claimed_at = now(), publish_attempts = publish_attempts + 1 WHERE id = ANY($1)",
        )
        .bind(&ids)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        self.fetch_many(&ids).await
    }

    pub async fn mark_published(&self, ids: &[Uuid]) -> Result<u64, sqlx::Error> {
        if ids.is_empty() {
            return Ok(0);
        }

        let result = sqlx::query(
            "UPDATE outbox_events SET published_at = now(), last_error = NULL WHERE id = ANY($1)",
        )
        .bind(ids)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn notify_published(
        &self,
        events: &[OutboxEvent],
        channel: &str,
    ) -> Result<u64, sqlx::Error> {
        if events.is_empty() {
            return Ok(0);
        }

        let mut notified = 0_u64;
        for event in events {
            let payload = serde_json::to_string(&LiveUpdateEvent {
                kind: event.aggregate_kind.clone(),
                id: event.aggregate_id.clone(),
                revision: event.revision,
                event: event.event_family.clone(),
            })
            .expect("serialize live update payload");
            sqlx::query("SELECT pg_notify($1, $2)")
                .bind(channel)
                .bind(payload)
                .execute(&self.pool)
                .await?;
            notified += 1;
        }

        Ok(notified)
    }

    pub async fn mark_failed(&self, id: Uuid, message: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE outbox_events SET claimed_at = NULL, last_error = $2 WHERE id = $1")
            .bind(id)
            .bind(message)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn purge_published(&self, limit: i64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM outbox_events
            WHERE ctid IN (
                SELECT ctid
                FROM outbox_events
                WHERE published_at < now() - interval '72 hours'
                ORDER BY published_at ASC
                LIMIT $1
            )
            "#,
        )
        .bind(limit)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    async fn fetch_many(&self, ids: &[Uuid]) -> Result<Vec<OutboxEvent>, sqlx::Error> {
        sqlx::query_as::<_, OutboxEvent>(
            "SELECT * FROM outbox_events WHERE id = ANY($1) ORDER BY created_at ASC",
        )
        .bind(ids)
        .fetch_all(&self.pool)
        .await
    }
}
