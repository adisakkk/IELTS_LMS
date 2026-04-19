#[path = "../support/postgres.rs"]
mod postgres;

use serde_json::json;
use sqlx::postgres::PgListener;
use std::time::Duration;

use ielts_backend_infrastructure::outbox::OutboxRepository;

const INFRA_MIGRATIONS: &[&str] = &[
    "0001_roles.sql",
    "0002_rls_helpers.sql",
    "0003_exam_core.sql",
    "0004_library_and_defaults.sql",
    "0005_scheduling_and_access.sql",
    "0006_delivery.sql",
    "0007_proctoring.sql",
    "0008_grading_results.sql",
    "0009_media_cache_outbox.sql",
    "0010_auth_security.sql",
    "0010_outbox_notify_trigger.sql",
];

#[tokio::test]
async fn outbox_rows_can_be_claimed_and_marked_published() {
    let database = postgres::TestDatabase::new(INFRA_MIGRATIONS).await;
    let repository = OutboxRepository::new(database.pool().clone());
    let mut listener = PgListener::connect(&database.database_url())
        .await
        .expect("connect listener");
    listener
        .listen("backend_live_wakeup")
        .await
        .expect("listen for wakeups");

    let created = repository
        .enqueue(
            "schedule_runtime",
            "schedule-123",
            4,
            "runtime_changed",
            &json!({ "scheduleId": "schedule-123", "event": "runtime_changed" }),
        )
        .await
        .expect("enqueue outbox event");
    assert_eq!(created.aggregate_kind, "schedule_runtime");

    let claimed = repository.claim_batch(10).await.expect("claim batch");
    assert_eq!(claimed.len(), 1);
    assert_eq!(claimed[0].id, created.id);
    assert_eq!(claimed[0].publish_attempts, 1);

    let published = repository
        .mark_published(&[created.id])
        .await
        .expect("mark published");
    assert_eq!(published, 1);
    let notified = repository
        .notify_published(&claimed, "backend_live_wakeup")
        .await
        .expect("notify live wakeups");
    assert_eq!(notified, 1);

    let notification = tokio::time::timeout(Duration::from_secs(1), listener.recv())
        .await
        .expect("receive wakeup notification")
        .expect("notification payload");
    let payload: serde_json::Value =
        serde_json::from_str(notification.payload()).expect("parse wakeup payload");
    assert_eq!(payload["kind"], "schedule_runtime");
    assert_eq!(payload["id"], "schedule-123");
    assert_eq!(payload["revision"], 4);
    assert_eq!(payload["event"], "runtime_changed");

    database.shutdown().await;
}

#[tokio::test]
async fn outbox_insert_triggers_wakeup_notification() {
    let database = postgres::TestDatabase::new(INFRA_MIGRATIONS).await;
    let repository = OutboxRepository::new(database.pool().clone());
    let mut listener = PgListener::connect(&database.database_url())
        .await
        .expect("connect listener");
    listener
        .listen("backend_outbox_wakeup")
        .await
        .expect("listen for outbox wakeups");

    let created = repository
        .enqueue(
            "schedule_runtime",
            "schedule-456",
            1,
            "runtime_changed",
            &json!({ "scheduleId": "schedule-456", "event": "runtime_changed" }),
        )
        .await
        .expect("enqueue outbox event");
    assert_eq!(created.aggregate_id, "schedule-456");

    let notification = tokio::time::timeout(Duration::from_secs(1), listener.recv())
        .await
        .expect("receive wakeup notification")
        .expect("notification payload");
    assert_eq!(notification.payload(), "wake");

    database.shutdown().await;
}
