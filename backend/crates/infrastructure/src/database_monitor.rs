use std::time::{Duration, Instant};

use sqlx::PgPool;

#[derive(Clone, Debug)]
pub struct OutboxBacklogSnapshot {
    pub pending_count: u64,
    pub oldest_age_seconds: i64,
}

#[derive(Clone, Debug)]
pub struct RelationSize {
    pub relation_name: String,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageBudgetThresholds {
    pub warning_bytes: u64,
    pub high_water_bytes: u64,
    pub critical_bytes: u64,
}

impl Default for StorageBudgetThresholds {
    fn default() -> Self {
        Self {
            warning_bytes: 750 * 1024 * 1024,
            high_water_bytes: 850 * 1024 * 1024,
            critical_bytes: 950 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StorageBudgetLevel {
    Normal,
    Warning,
    HighWater,
    Critical,
}

impl StorageBudgetLevel {
    pub fn as_label(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Warning => "warning",
            Self::HighWater => "high_water",
            Self::Critical => "critical",
        }
    }

    pub fn as_severity_code(self) -> i64 {
        match self {
            Self::Normal => 0,
            Self::Warning => 1,
            Self::HighWater => 2,
            Self::Critical => 3,
        }
    }
}

#[derive(Clone, Debug)]
pub struct StorageBudgetSnapshot {
    pub total_bytes: u64,
    pub level: StorageBudgetLevel,
    pub largest_relations: Vec<RelationSize>,
}

pub async fn ping_database(pool: &PgPool) -> Result<Duration, sqlx::Error> {
    let started = Instant::now();
    sqlx::query_scalar::<_, i64>("SELECT 1::bigint")
        .fetch_one(pool)
        .await?;
    Ok(started.elapsed())
}

pub async fn inspect_outbox_backlog(pool: &PgPool) -> Result<OutboxBacklogSnapshot, sqlx::Error> {
    let row = sqlx::query_as::<_, OutboxBacklogRow>(
        r#"
        SELECT
            COUNT(*)::bigint AS pending_count,
            COALESCE(EXTRACT(EPOCH FROM now() - MIN(created_at))::bigint, 0) AS oldest_age_seconds
        FROM outbox_events
        WHERE published_at IS NULL
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(OutboxBacklogSnapshot {
        pending_count: row.pending_count.max(0) as u64,
        oldest_age_seconds: row.oldest_age_seconds.max(0),
    })
}

pub async fn inspect_storage_budget(
    pool: &PgPool,
    thresholds: StorageBudgetThresholds,
) -> Result<StorageBudgetSnapshot, sqlx::Error> {
    let total_bytes = sqlx::query_scalar::<_, i64>("SELECT pg_database_size(current_database())")
        .fetch_one(pool)
        .await?
        .max(0) as u64;

    let largest_relations = sqlx::query_as::<_, RelationSizeRow>(
        r#"
        SELECT
            relname AS relation_name,
            pg_total_relation_size(relid)::bigint AS total_bytes
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 5
        "#,
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| RelationSize {
        relation_name: row.relation_name,
        total_bytes: row.total_bytes.max(0) as u64,
    })
    .collect();

    let level = if total_bytes >= thresholds.critical_bytes {
        StorageBudgetLevel::Critical
    } else if total_bytes >= thresholds.high_water_bytes {
        StorageBudgetLevel::HighWater
    } else if total_bytes >= thresholds.warning_bytes {
        StorageBudgetLevel::Warning
    } else {
        StorageBudgetLevel::Normal
    };

    Ok(StorageBudgetSnapshot {
        total_bytes,
        level,
        largest_relations,
    })
}

#[derive(sqlx::FromRow)]
struct OutboxBacklogRow {
    pending_count: i64,
    oldest_age_seconds: i64,
}

#[derive(sqlx::FromRow)]
struct RelationSizeRow {
    relation_name: String,
    total_bytes: i64,
}
