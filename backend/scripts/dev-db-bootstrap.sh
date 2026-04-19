#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DEFAULT_DB_NAME="ielts"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

resolve_database_name() {
  local env_file="${1:-.env}"

  if [[ -f "$env_file" ]]; then
    local db_name
    db_name="$(sed -n 's/^DATABASE_DIRECT_URL=.*\/\([^/?#[:space:]]\+\).*$/\1/p' "$env_file" | head -n 1)"
    if [[ -n "$db_name" ]]; then
      printf '%s\n' "$db_name"
      return 0
    fi
  fi

  printf '%s\n' "$DEFAULT_DB_NAME"
}

wait_for_postgres() {
  until compose exec -T postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; do
    sleep 1
  done
}

wait_for_pgbouncer() {
  local db_name="$1"

  until compose exec -e PGPASSWORD=postgres -T postgres \
    psql -h pgbouncer -p 6432 -U postgres -d "$db_name" -Atc 'select 1' >/dev/null 2>&1; do
    sleep 1
  done
}

run_sql() {
  local db_name="$1"
  local sql="$2"

  compose exec -T postgres psql -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -Atc "$sql"
}

ensure_database_exists() {
  local db_name="$1"
  local exists

  exists="$(compose exec -T postgres psql -U postgres -d postgres -Atc "select 1 from pg_database where datname = '$db_name'")"

  if [[ "$exists" != "1" ]]; then
    compose exec -T postgres psql -U postgres -d postgres -c "create database \"$db_name\""
  fi
}

ensure_migration_tracking() {
  local db_name="$1"
  local recorded_count
  local existing_tables
  local has_exam_entities
  local has_shared_cache_entries
  local migration
  local filename

  run_sql "$db_name" \
    "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())" \
    >/dev/null

  recorded_count="$(run_sql "$db_name" "select count(*) from schema_migrations")"
  existing_tables="$(
    run_sql "$db_name" \
      "select count(*) from information_schema.tables where table_schema = 'public' and table_name <> 'schema_migrations'"
  )"

  if [[ "$recorded_count" != "0" || "$existing_tables" == "0" ]]; then
    return 0
  fi

  has_exam_entities="$(run_sql "$db_name" "select to_regclass('public.exam_entities') is not null")"
  has_shared_cache_entries="$(run_sql "$db_name" "select to_regclass('public.shared_cache_entries') is not null")"

  if [[ "$has_exam_entities" != "t" || "$has_shared_cache_entries" != "t" ]]; then
    echo "Existing schema detected without migration history; reset the dev volume before continuing." >&2
    exit 1
  fi

  for migration in migrations/*.sql; do
    filename="$(basename "$migration")"
    run_sql "$db_name" \
      "insert into schema_migrations (filename) values ('$filename') on conflict (filename) do nothing" \
      >/dev/null
  done

  echo "Backfilled schema_migrations for an existing development schema."
}

apply_migrations() {
  local db_name="$1"
  local migration
  local filename
  local already_applied

  ensure_migration_tracking "$db_name"

  for migration in migrations/*.sql; do
    filename="$(basename "$migration")"
    already_applied="$(run_sql "$db_name" "select 1 from schema_migrations where filename = '$filename'")"

    if [[ "$already_applied" == "1" ]]; then
      continue
    fi

    echo "Applying ${migration}"
    cat "$migration" | compose exec -T postgres psql -U postgres -d "$db_name" -v ON_ERROR_STOP=1 >/dev/null
    run_sql "$db_name" \
      "insert into schema_migrations (filename) values ('$filename') on conflict (filename) do nothing" \
      >/dev/null
  done
}

main() {
  local db_name
  db_name="$(resolve_database_name)"

  if [[ ! "$db_name" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Unsupported database name: $db_name" >&2
    exit 1
  fi

  wait_for_postgres
  ensure_database_exists "$db_name"
  apply_migrations "$db_name"
  wait_for_pgbouncer "$db_name"

  echo "Development database and PgBouncer are ready for ${db_name}."
}

main "$@"
