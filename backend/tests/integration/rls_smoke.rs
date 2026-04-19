#[path = "../support/postgres.rs"]
mod postgres;

use sqlx::query_scalar;
use uuid::Uuid;

use ielts_backend_infrastructure::{
    actor_context::{ActorContext, ActorRole},
    tx::begin_scoped_transaction,
};

#[tokio::test]
async fn begin_scoped_transaction_sets_transaction_local_actor_context() {
    let database = postgres::TestDatabase::new(&["0001_roles.sql", "0002_rls_helpers.sql"]).await;
    let context = ActorContext::new(Uuid::new_v4(), ActorRole::Admin)
        .with_organization_id(Uuid::new_v4())
        .with_schedule_scope_id(Uuid::new_v4())
        .with_student_scope_key("student-123");

    let expected_actor_id = context.actor_id.to_string();
    let expected_org_id = context.organization_id.unwrap().to_string();

    let mut tx = begin_scoped_transaction(database.pool(), &context)
        .await
        .expect("transaction");

    let actor_id: Option<String> =
        query_scalar::<_, Option<String>>("select current_setting('app.actor_id', true)")
            .fetch_one(tx.as_mut())
            .await
            .expect("actor id");
    let organization_id: Option<String> =
        query_scalar::<_, Option<String>>("select current_setting('app.organization_id', true)")
            .fetch_one(tx.as_mut())
            .await
            .expect("organization id");

    assert_eq!(actor_id, Some(expected_actor_id));
    assert_eq!(organization_id, Some(expected_org_id));

    tx.rollback().await.expect("rollback");
    database.shutdown().await;
}

#[tokio::test]
async fn actor_context_disappears_after_commit_and_does_not_leak() {
    let database = postgres::TestDatabase::new(&["0001_roles.sql", "0002_rls_helpers.sql"]).await;
    let first = ActorContext::new(Uuid::new_v4(), ActorRole::AdminObserver);
    let second = ActorContext::new(Uuid::new_v4(), ActorRole::Student);

    {
        let tx = begin_scoped_transaction(database.pool(), &first)
            .await
            .expect("first transaction");
        tx.commit().await.expect("commit");
    }

    let after_commit: Option<String> = query_scalar::<_, Option<String>>(
        "select nullif(current_setting('app.actor_id', true), '')",
    )
    .fetch_one(database.pool())
    .await
    .expect("actor id after commit");

    assert_eq!(after_commit, None);

    let mut tx = begin_scoped_transaction(database.pool(), &second)
        .await
        .expect("second transaction");
    let second_actor_id: Option<String> =
        query_scalar::<_, Option<String>>("select current_setting('app.actor_id', true)")
            .fetch_one(tx.as_mut())
            .await
            .expect("second actor id");

    assert_eq!(second_actor_id, Some(second.actor_id.to_string()));

    tx.rollback().await.expect("rollback");
    database.shutdown().await;
}
