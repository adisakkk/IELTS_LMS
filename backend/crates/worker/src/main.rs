use std::{
    env,
    time::{Duration, Instant},
};

use ielts_backend_infrastructure::{
    config::AppConfig,
    database_monitor::{inspect_storage_budget, StorageBudgetLevel},
};
use ielts_backend_worker::jobs;
use sqlx::postgres::{PgListener, PgPoolOptions};
use tokio::sync::broadcast;

const MAX_OUTBOX_BATCHES_PER_CYCLE: usize = 20;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WorkerTrigger {
    Notify,
    Poll,
}

impl WorkerTrigger {
    fn as_str(self) -> &'static str {
        match self {
            Self::Notify => "NOTIFY",
            Self::Poll => "POLL",
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = AppConfig::from_env();
    ielts_backend_infrastructure::tracing::init_tracing(
        "ielts-backend-worker",
        config.otel_exporter_otlp_endpoint.as_deref(),
    )?;
    let database_url = env::var("DATABASE_WORKER_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| config.database_url.clone());
    let Some(database_url) = database_url else {
        tracing::warn!("DATABASE_URL is not configured; worker exiting");
        return Ok(());
    };

    let pool = PgPoolOptions::new()
        .max_connections(config.db_pool_max_connections)
        .acquire_timeout(Duration::from_millis(config.db_pool_acquire_timeout_ms))
        .connect(&database_url)
        .await?;
    let fallback_interval = Duration::from_secs(config.worker_fallback_interval_secs);
    let outbox_listener_url = config.database_direct_url.clone();
    if outbox_listener_url.is_none() {
        tracing::warn!(
            channel = %config.worker_outbox_notify_channel,
            "DATABASE_DIRECT_URL is not configured; outbox notify listener disabled"
        );
    }
    let mut outbox_listener = connect_outbox_listener(
        outbox_listener_url.as_deref(),
        &config.worker_outbox_notify_channel,
    )
    .await;
    let (shutdown_tx, _) = broadcast::channel(1);
    let maintenance_handle = spawn_maintenance_loop(
        pool.clone(),
        config.clone(),
        fallback_interval,
        shutdown_tx.subscribe(),
    );

    tracing::info!(
        legacy_poll_interval_ms = config.worker_poll_interval_ms,
        fallback_interval_secs = config.worker_fallback_interval_secs,
        max_connections = config.db_pool_max_connections,
        outbox_notify_channel = %config.worker_outbox_notify_channel,
        outbox_listener_enabled = outbox_listener.is_some(),
        "worker started"
    );

    let result: Result<(), sqlx::Error> = 'worker: loop {
        if outbox_listener.is_none() && outbox_listener_url.is_some() {
            outbox_listener = connect_outbox_listener(
                outbox_listener_url.as_deref(),
                &config.worker_outbox_notify_channel,
            )
            .await;
        }

        let mut listener_disconnected = false;
        let trigger = if let Some(listener) = outbox_listener.as_mut() {
            tokio::select! {
                notification = listener.recv() => {
                    match notification {
                        Ok(notification) => {
                            tracing::debug!(
                                channel = %config.worker_outbox_notify_channel,
                                payload = notification.payload(),
                                "received outbox wakeup"
                            );
                            WorkerTrigger::Notify
                        }
                        Err(error) => {
                            tracing::warn!(
                                error = %error,
                                channel = %config.worker_outbox_notify_channel,
                                "outbox notify listener disconnected"
                            );
                            listener_disconnected = true;
                            WorkerTrigger::Poll
                        }
                    }
                }
                _ = tokio::time::sleep(fallback_interval) => WorkerTrigger::Poll,
                _ = shutdown_signal() => {
                    tracing::info!("worker received shutdown signal");
                    break 'worker Ok(());
                }
            }
        } else {
            tokio::select! {
                _ = tokio::time::sleep(fallback_interval) => WorkerTrigger::Poll,
                _ = shutdown_signal() => {
                    tracing::info!("worker received shutdown signal");
                    break 'worker Ok(());
                }
            }
        };

        if listener_disconnected {
            outbox_listener = None;
        }

        let cycle_started = Instant::now();
        if let Err(error) = run_outbox_cycle(&pool, &config, trigger, cycle_started).await {
            break 'worker Err(error);
        }
    };

    let _ = shutdown_tx.send(());
    match maintenance_handle.await {
        Ok(()) => {}
        Err(error) => tracing::warn!(error = %error, "maintenance loop join failed"),
    }

    ielts_backend_infrastructure::tracing::shutdown_tracing();
    result.map_err(|error| Box::new(error) as Box<dyn std::error::Error + Send + Sync>)
}

async fn run_outbox_cycle(
    pool: &sqlx::PgPool,
    config: &AppConfig,
    trigger: WorkerTrigger,
    cycle_started: Instant,
) -> Result<(), sqlx::Error> {
    let outbox = drain_outbox_until_empty(pool.clone(), &config.live_mode_notify_channel).await?;
    let retention = jobs::retention::run_once(pool.clone()).await?;
    let media = jobs::media::run_once(pool.clone()).await?;
    log_storage_budget(pool, config).await?;

    tracing::info!(
        trigger = trigger.as_str(),
        cycle_duration_ms = cycle_started.elapsed().as_millis() as u64,
        outbox_claimed = outbox.claimed,
        outbox_published = outbox.published,
        outbox_wakeups_notified = outbox.wakeups_notified,
        outbox_failed = outbox.failed,
        outbox_duration_ms = outbox.duration_ms,
        retention_total_rows = retention.total_rows(),
        retention_cache_rows = retention.cache_rows,
        retention_idempotency_rows = retention.idempotency_rows,
        retention_heartbeat_rows = retention.heartbeat_rows,
        retention_mutation_rows = retention.mutation_rows,
        retention_outbox_rows = retention.outbox_rows,
        retention_duration_ms = retention.duration_ms,
        media_total_rows = media.total_rows(),
        media_orphaned_rows = media.orphaned_rows,
        media_deleted_rows = media.deleted_rows,
        media_duration_ms = media.duration_ms,
        "worker pass complete"
    );

    Ok(())
}

fn spawn_maintenance_loop(
    pool: sqlx::PgPool,
    config: AppConfig,
    interval: Duration,
    mut shutdown: broadcast::Receiver<()>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut maintenance_interval = tokio::time::interval(interval);
        maintenance_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        maintenance_interval.tick().await;

        loop {
            tokio::select! {
                _ = maintenance_interval.tick() => {
                    let cycle_started = Instant::now();
                    if let Err(error) = run_maintenance_cycle(&pool, &config, cycle_started).await {
                        tracing::error!(error = %error, "maintenance cycle failed");
                    }
                }
                _ = shutdown.recv() => {
                    tracing::info!("worker maintenance loop received shutdown signal");
                    break;
                }
            }
        }
    })
}

async fn run_maintenance_cycle(
    pool: &sqlx::PgPool,
    config: &AppConfig,
    cycle_started: Instant,
) -> Result<(), sqlx::Error> {
    let retention = jobs::retention::run_once(pool.clone()).await?;
    let media = jobs::media::run_once(pool.clone()).await?;
    log_storage_budget(pool, config).await?;

    tracing::info!(
        cycle_duration_ms = cycle_started.elapsed().as_millis() as u64,
        retention_total_rows = retention.total_rows(),
        retention_cache_rows = retention.cache_rows,
        retention_idempotency_rows = retention.idempotency_rows,
        retention_heartbeat_rows = retention.heartbeat_rows,
        retention_mutation_rows = retention.mutation_rows,
        retention_outbox_rows = retention.outbox_rows,
        retention_duration_ms = retention.duration_ms,
        media_total_rows = media.total_rows(),
        media_orphaned_rows = media.orphaned_rows,
        media_deleted_rows = media.deleted_rows,
        media_duration_ms = media.duration_ms,
        "maintenance pass complete"
    );

    Ok(())
}

async fn drain_outbox_until_empty(
    pool: sqlx::PgPool,
    notify_channel: &str,
) -> Result<jobs::outbox::OutboxRunReport, sqlx::Error> {
    let started = Instant::now();
    let mut total = jobs::outbox::OutboxRunReport::default();

    for batch_index in 0..MAX_OUTBOX_BATCHES_PER_CYCLE {
        let batch = jobs::outbox::run_once(pool.clone(), notify_channel).await?;
        total.claimed += batch.claimed;
        total.published += batch.published;
        total.wakeups_notified += batch.wakeups_notified;
        total.failed += batch.failed;

        if batch.claimed == 0 {
            break;
        }

        if batch_index + 1 == MAX_OUTBOX_BATCHES_PER_CYCLE {
            tracing::warn!(
                batches = MAX_OUTBOX_BATCHES_PER_CYCLE,
                claimed = total.claimed,
                published = total.published,
                "outbox drain cap reached"
            );
            break;
        }
    }

    total.duration_ms = started.elapsed().as_millis() as u64;
    Ok(total)
}

async fn connect_outbox_listener(listen_url: Option<&str>, channel: &str) -> Option<PgListener> {
    let listen_url = listen_url?;

    match PgListener::connect(listen_url).await {
        Ok(mut listener) => match listener.listen(channel).await {
            Ok(()) => {
                tracing::info!(channel = channel, "listening for outbox wakeups");
                Some(listener)
            }
            Err(error) => {
                tracing::warn!(
                    error = %error,
                    channel = channel,
                    "failed to subscribe to outbox wakeup channel"
                );
                None
            }
        },
        Err(error) => {
            tracing::warn!(error = %error, "failed to connect postgres outbox listener");
            None
        }
    }
}

async fn log_storage_budget(pool: &sqlx::PgPool, config: &AppConfig) -> Result<(), sqlx::Error> {
    let snapshot = inspect_storage_budget(pool, config.storage_budget_thresholds.clone()).await?;

    match snapshot.level {
        StorageBudgetLevel::Normal => tracing::info!(
            total_bytes = snapshot.total_bytes,
            largest_relations = ?snapshot.largest_relations,
            "storage budget within thresholds"
        ),
        StorageBudgetLevel::Warning => tracing::warn!(
            total_bytes = snapshot.total_bytes,
            largest_relations = ?snapshot.largest_relations,
            "storage budget warning threshold reached"
        ),
        StorageBudgetLevel::HighWater => tracing::warn!(
            total_bytes = snapshot.total_bytes,
            largest_relations = ?snapshot.largest_relations,
            "storage budget high-water threshold reached"
        ),
        StorageBudgetLevel::Critical => tracing::error!(
            total_bytes = snapshot.total_bytes,
            largest_relations = ?snapshot.largest_relations,
            "storage budget critical threshold reached"
        ),
    }

    Ok(())
}

#[cfg(unix)]
async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}

#[cfg(not(unix))]
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("install ctrl-c handler");
}
