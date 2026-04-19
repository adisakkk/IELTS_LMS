#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_DIRECT_URL:-}" ]]; then
  echo "DATABASE_DIRECT_URL must be set"
  exit 1
fi

restore_db="${BACKUP_REHEARSAL_DB:-ielts_restore_rehearsal}"
dump_file="$(mktemp -t ielts-backup-XXXXXX.dump)"

cleanup() {
  rm -f "$dump_file"
}

trap cleanup EXIT

echo "Creating backup from ${DATABASE_DIRECT_URL}"
pg_dump "$DATABASE_DIRECT_URL" --format=custom --file "$dump_file"

echo "Recreating restore database ${restore_db}"
dropdb --if-exists "$restore_db"
createdb "$restore_db"

echo "Restoring backup into ${restore_db}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$restore_db" "$dump_file"

echo "Running restore smoke check"
psql -d "$restore_db" -c "select current_database() as restored_database, now() as verified_at;"
