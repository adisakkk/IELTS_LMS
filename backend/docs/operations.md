# Backend Operations

## Runtime

- `ielts-backend-api` exposes `/healthz`, `/readyz`, and `/metrics` plus the backend contract routes.
- `ielts-backend-worker` runs a continuous poll loop for outbox publish, retention, orphaned-media cleanup, and storage-budget checks.
- PostgreSQL remains the only hard durability dependency. PgBouncer and object storage stay optional in local development, but production assumptions require both.

## Observability

- Request latency is exposed through `backend_http_request_duration_seconds`.
- Database-backed route latency is exposed through `backend_db_operation_duration_seconds`.
- Publish validation, answer durability, violation-to-alert, outbox backlog, WebSocket connection count, and storage budget all have dedicated Prometheus metrics.
- `PROMETHEUS_ENABLED=false` disables `/metrics`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` enables OTLP export for both API and worker processes. When unset, the same spans stay in the local tracing output only.

## Retention and Storage Guardrails

- `shared_cache_entries`: prune invalidated rows and expired rows after a 24 hour grace period.
- `idempotency_keys`: purge rows 24 hours after expiry.
- `student_heartbeat_events`: prune rows older than 7 days once the parent schedule is no longer `live`.
- `student_attempt_mutations`: prune rows older than 30 days after the attempt is submitted or the parent schedule reaches `completed` or `cancelled`.
- `outbox_events`: prune published rows older than 72 hours.
- `media_assets`: mark pending uploads older than 24 hours as `orphaned`, then hard delete rows once `delete_after_at` passes.
- Storage warning threshold: `750 MB`.
- Storage high-water threshold: `850 MB`.
- Storage critical threshold: `950 MB`.
- The worker logs the largest relations whenever a threshold is reached so operators can decide whether to prune, archive, or halt cache growth.

## Local Runbook

1. Start dependencies with `make db-up`.
   This now waits for PostgreSQL, creates the `ielts` database if needed, applies every SQL migration, and verifies PgBouncer auth before returning.
2. Export values from [backend/.env.example](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/backend/.env.example).
   Local Docker ports are `15432` for direct PostgreSQL and `16432` for PgBouncer so the backend does not collide with a host Postgres on `5432`.
   Local PgBouncer runs in `session` mode so the Rust services stay compatible with SQLx prepared statements during development.
3. Run the API with `make api`.
4. Run the worker with `make worker`.
5. Check readiness with `curl http://127.0.0.1:4000/readyz`.
6. Check Prometheus output with `curl http://127.0.0.1:4000/metrics`.
7. Run the backend quality gates with `make ops-check`.

## Load Test Rehearsal

- `make load-test` runs `backend/scripts/load-test.js`.
- Supported scenarios:
  - `schedule-start-surge`
  - `mutation-burst`
  - `heartbeat-sustained`
  - `restart-during-live-traffic`
- Configure the scenario through:
  - `BACKEND_BASE_URL`
  - `LOAD_TEST_SCENARIO`
  - `LOAD_TEST_CONCURRENCY`
  - `LOAD_TEST_REQUESTS`
  - `LOAD_TEST_REQUEST_DELAY_MS`
  - `LOAD_TEST_BOOTSTRAP_PATH` and `LOAD_TEST_BOOTSTRAP_BODY`
  - `LOAD_TEST_MUTATION_PATH` and `LOAD_TEST_MUTATION_BODY`
  - `LOAD_TEST_HEARTBEAT_PATH` and `LOAD_TEST_HEARTBEAT_BODY`
  - `LOAD_TEST_RESTART_AFTER_MS`
  - `LOAD_TEST_RESTART_CMD_TIMEOUT_MS`
  - `LOAD_TEST_RESTART_TRAFFIC_SCENARIO`
- `LOAD_TEST_API_RESTART_CMD`
- `LOAD_TEST_WORKER_RESTART_CMD`
- Record the emitted JSON artifact in CI or attach it to an incident/readiness review.
- `restart-during-live-traffic` keeps issuing the chosen traffic scenario while it shells out to the restart commands. Set `LOAD_TEST_REQUEST_DELAY_MS` and `LOAD_TEST_REQUESTS` high enough that traffic is still active when the restart window arrives.
- The latest local rehearsal evidence is captured in [task-11-readiness-evidence.md](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/backend/docs/task-11-readiness-evidence.md).

## Backup Restore Rehearsal

- `make backup-rehearsal` runs `backend/scripts/backup-rehearsal.sh`.
- Required environment:
  - `DATABASE_DIRECT_URL`
  - optional `BACKUP_REHEARSAL_DB`
- The rehearsal creates a fresh dump, restores it into a disposable database, and runs a smoke query against the restored database.
- The latest local rehearsal evidence is captured in [task-11-readiness-evidence.md](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/backend/docs/task-11-readiness-evidence.md).

## Failover Checklist

1. PostgreSQL primary failure: promote the standby, repoint PgBouncer, then confirm `readyz` before reopening traffic.
2. PgBouncer loss: fail over to a healthy PgBouncer instance or temporarily point the API and worker at direct PostgreSQL only for controlled incident handling.
3. API instance loss: replace the instance and confirm request latency plus metrics freshness; durable writes should continue throughout.
4. Worker instance loss: replace the worker and watch `backend_outbox_backlog_events` plus `backend_outbox_oldest_age_seconds` until they recover.

## Rollback for Frontend Adapter Cutover

1. Flip `FEATURE_USE_BACKEND_BUILDER=false`.
2. Flip `FEATURE_USE_BACKEND_SCHEDULING=false`.
3. Flip `FEATURE_USE_BACKEND_DELIVERY=false`.
4. Flip `FEATURE_USE_BACKEND_PROCTORING=false`.
5. Flip `FEATURE_USE_BACKEND_GRADING=false`.
6. Redeploy the frontend if those flags are baked at build time.
7. Keep the backend running while investigating so no durable data is lost during rollback analysis.
