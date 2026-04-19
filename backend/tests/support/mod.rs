use sqlx::{PgPool, Postgres, Transaction};
use std::time::Duration;
use uuid::Uuid;

pub mod fixtures;

/// Helper to run a test within a transaction that gets rolled back.
pub async fn with_test_tx<F, Fut, T>(pool: &PgPool, f: F) -> T
where
    F: FnOnce(Transaction<'_, Postgres>) -> Fut,
    Fut: std::future::Future<Output = T>,
{
    let tx = pool.begin().await.expect("begin transaction");
    f(tx).await
}

/// Wait for outbox processing to complete (used in integration tests).
pub async fn wait_for_outbox(pool: &PgPool, timeout: Duration) -> Result<(), Box<dyn std::error::Error>> {
    let start = std::time::Instant::now();
    loop {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL"
        )
        .fetch_one(pool)
        .await?;
        
        if count == 0 {
            return Ok(());
        }
        
        if start.elapsed() > timeout {
            return Err("outbox processing timeout".into());
        }
        
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// Generate a unique test ID to avoid collisions.
pub fn test_id() -> String {
    format!("test_{}", Uuid::new_v4())
}

/// Clean up test data for a specific test run.
pub async fn cleanup_test_data(pool: &PgPool, test_prefix: &str) -> Result<(), sqlx::Error> {
    // Delete in order respecting foreign keys
    sqlx::query("DELETE FROM student_attempt_mutations WHERE attempt_id LIKE $1")
        .bind(format!("{}%", test_prefix))
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM student_heartbeat_events WHERE attempt_id LIKE $1")
        .bind(format!("{}%", test_prefix))
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM student_attempts WHERE student_key LIKE $1")
        .bind(format!("{}%", test_prefix))
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM schedule_registrations WHERE student_key LIKE $1")
        .bind(format!("{}%", test_prefix))
        .execute(pool)
        .await?;
    Ok(())
}
