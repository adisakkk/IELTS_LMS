use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::actor_context::ActorContext;

pub async fn begin_scoped_transaction<'a>(
    pool: &'a PgPool,
    actor_context: &ActorContext,
) -> Result<Transaction<'a, Postgres>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    apply_actor_context(&mut tx, actor_context).await?;
    Ok(tx)
}

pub async fn apply_actor_context(
    tx: &mut Transaction<'_, Postgres>,
    actor_context: &ActorContext,
) -> Result<(), sqlx::Error> {
    set_local(tx, "app.actor_id", &actor_context.actor_id.to_string()).await?;
    set_local(tx, "app.role", actor_context.role.as_str()).await?;
    set_local(
        tx,
        "app.organization_id",
        &optional_uuid(actor_context.organization_id),
    )
    .await?;
    set_local(
        tx,
        "app.scope_schedule_id",
        &optional_uuid(actor_context.schedule_scope_id),
    )
    .await?;
    set_local(
        tx,
        "app.scope_student_key",
        actor_context.student_scope_key.as_deref().unwrap_or(""),
    )
    .await?;

    Ok(())
}

async fn set_local(
    tx: &mut Transaction<'_, Postgres>,
    setting_name: &str,
    setting_value: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("select set_config($1, $2, true)")
        .bind(setting_name)
        .bind(setting_value)
        .execute(tx.as_mut())
        .await?;

    Ok(())
}

fn optional_uuid(value: Option<Uuid>) -> String {
    value.map(|uuid| uuid.to_string()).unwrap_or_default()
}
