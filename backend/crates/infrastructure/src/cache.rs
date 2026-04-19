use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;

#[derive(Clone)]
pub struct CacheRepository {
    pool: PgPool,
}

impl CacheRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, cache_key: &str) -> Result<Option<Value>, sqlx::Error> {
        sqlx::query_scalar(
            r#"
            SELECT payload
            FROM shared_cache_entries
            WHERE cache_key = $1
              AND invalidated_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            "#,
        )
        .bind(cache_key)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn put(
        &self,
        cache_key: &str,
        payload: &Value,
        revision: i64,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO shared_cache_entries (
                cache_key, payload, revision, invalidated_at, expires_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, NULL, $4, now(), now())
            ON CONFLICT (cache_key)
            DO UPDATE SET
                payload = EXCLUDED.payload,
                revision = EXCLUDED.revision,
                invalidated_at = NULL,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()
            "#,
        )
        .bind(cache_key)
        .bind(payload)
        .bind(revision)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn invalidate(&self, cache_key: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE shared_cache_entries SET invalidated_at = now(), updated_at = now() WHERE cache_key = $1",
        )
        .bind(cache_key)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
