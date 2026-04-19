# Task 11 Readiness Evidence

Rehearsal date: `2026-04-18`

Environment:

- worktree: `/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend`
- API base URL: `http://127.0.0.1:4010`
- primary database: `ielts_task11_1776478950`
- restore database: `ielts_task11_1776478950_restore`

## Load Tests

| Scenario | Parameters | Result |
| --- | --- | --- |
| `schedule-start-surge` | `concurrency=10`, `requests=40` | `p50=8.42 ms`, `p95=140.42 ms`, `p99=206.76 ms`, `failures=0` |
| `mutation-burst` | `concurrency=10`, `requests=40` | `p50=18.28 ms`, `p95=505.93 ms`, `p99=510.30 ms`, `failures=0` |
| `heartbeat-sustained` | `concurrency=5`, `requests=60`, `requestDelayMs=50` | `p50=9.88 ms`, `p95=117.72 ms`, `p99=194.57 ms`, `failures=0` |
| `restart-during-live-traffic` | `trafficScenario=mutation-burst`, `concurrency=4`, `requests=80`, `requestDelayMs=75`, `restartAfterMs=500` | `p50=5.55 ms`, `p95=72.83 ms`, `p99=127.47 ms`, `failures=0` |

Restart rehearsal details:

- API restart command: `bash /tmp/ielts-task11-restart-api.sh`
- worker restart command: `bash /tmp/ielts-task11-restart-worker.sh`
- API restart duration: `82.25 ms`
- worker restart duration: `32.76 ms`
- `student_attempt_mutations` for rehearsal attempt: `80 -> 160` during the restart scenario
- post-restart readiness check: `{"status":"ready","database":"ready","liveModeEnabled":true}`

## Backup Restore Rehearsal

Command:

```bash
DATABASE_DIRECT_URL="$DB_URL" BACKUP_REHEARSAL_DB="${DB_NAME}_restore" bash ./scripts/backup-rehearsal.sh
```

Restore smoke check:

- restored database: `ielts_task11_1776478950_restore`
- verified at: `2026-04-18 09:37:45.546997+07`

Row-count parity between primary and restore:

| Relation | Primary | Restore |
| --- | --- | --- |
| `exam_schedules` | `1` | `1` |
| `student_attempts` | `42` | `42` |
| `student_attempt_mutations` | `160` | `160` |
| `shared_cache_entries` | `0` | `0` |

## Frontend Cutover Notes

- Backend-enabled adapters now surface backend failures instead of silently reading durable state from `localStorage`.
- Coverage exists in:
  - `src/services/__tests__/examRepository.test.ts`
  - `src/services/__tests__/adminPreferencesRepository.backend.test.ts`
  - `src/services/__tests__/studentAttemptRepository.backend.test.ts`
  - `src/services/__tests__/gradingService.backend.test.ts`
- `localStorage` remains only for explicit rollback mode when backend feature flags are disabled and for client-side mutation or heartbeat caches that are not treated as the durable source of truth.
