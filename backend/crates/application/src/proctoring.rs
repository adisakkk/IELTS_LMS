use chrono::{DateTime, Utc};
use ielts_backend_domain::schedule::{
    AlertAckRequest, AttemptCommandRequest, CompleteExamRequest, DegradedLiveState,
    ExamSessionRuntime, ExtendSectionRequest, PresenceAction, ProctorAlert, ProctorPresence,
    ProctorPresenceRequest, ProctorSessionDetail, ProctorSessionSummary, RuntimeStatus,
    SectionRuntimeStatus, SessionAuditLog, SessionNote, StudentSessionSummary, ViolationRule,
};
use ielts_backend_infrastructure::{
    actor_context::{ActorContext, ActorRole},
    live_mode::LiveModeService,
    outbox::OutboxRepository,
};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use uuid::Uuid;

use crate::scheduling::{SchedulingError, SchedulingService};

#[derive(Error, Debug)]
pub enum ProctoringError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct ProctoringService {
    pool: PgPool,
}

impl ProctoringService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_sessions(
        &self,
        live_mode_enabled: bool,
    ) -> Result<Vec<ProctorSessionSummary>, ProctoringError> {
        let actor = system_actor();
        let scheduling = SchedulingService::new(self.pool.clone());
        let live_mode = LiveModeService::new(self.pool.clone());
        let schedules = scheduling
            .list_schedules(&actor)
            .await
            .map_err(map_scheduling_error)?;
        let mut items = Vec::with_capacity(schedules.len());

        for schedule in schedules {
            let runtime = scheduling
                .get_runtime(&actor, schedule.id)
                .await
                .map_err(map_scheduling_error)?;
            let student_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM student_attempts WHERE schedule_id = $1")
                    .bind(schedule.id)
                    .fetch_one(&self.pool)
                    .await?;
            let active_count: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*)
                FROM student_attempts
                WHERE schedule_id = $1
                  AND COALESCE(proctor_status, 'active') NOT IN ('terminated', 'paused')
                  AND phase = 'exam'
                "#,
            )
            .bind(schedule.id)
            .fetch_one(&self.pool)
            .await?;
            let alert_count: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*)
                FROM session_audit_logs
                WHERE schedule_id = $1
                  AND acknowledged_at IS NULL
                  AND action_type IN (
                    'HEARTBEAT_LOST',
                    'DEVICE_CONTINUITY_FAILED',
                    'NETWORK_DISCONNECTED',
                    'AUTO_ACTION',
                    'STUDENT_WARN',
                    'STUDENT_PAUSE',
                    'STUDENT_TERMINATE'
                  )
                "#,
            )
            .bind(schedule.id)
            .fetch_one(&self.pool)
            .await?;
            let degraded = live_mode
                .snapshot(live_mode_enabled, Some(schedule.id))
                .await?;

            items.push(ProctorSessionSummary {
                schedule,
                runtime,
                student_count,
                active_count,
                alert_count,
                degraded_live_mode: degraded.degraded,
            });
        }

        Ok(items)
    }

    #[tracing::instrument(skip(self), fields(schedule_id = %schedule_id))]
    pub async fn get_session_detail(
        &self,
        schedule_id: Uuid,
        live_mode_enabled: bool,
    ) -> Result<ProctorSessionDetail, ProctoringError> {
        let actor = system_actor();
        let scheduling = SchedulingService::new(self.pool.clone());
        let schedule = scheduling
            .get_schedule(&actor, schedule_id)
            .await
            .map_err(map_scheduling_error)?;
        let runtime = scheduling
            .get_runtime(&actor, schedule_id)
            .await
            .map_err(map_scheduling_error)?;
        let degraded = LiveModeService::new(self.pool.clone())
            .snapshot(live_mode_enabled, Some(schedule_id))
            .await?;
        let sessions = self.load_student_sessions(schedule_id, &runtime).await?;
        let audit_logs = self.load_audit_logs(schedule_id).await?;
        let alerts = build_alerts(&audit_logs, &sessions);
        let notes = sqlx::query_as::<_, SessionNote>(
            "SELECT * FROM session_notes WHERE schedule_id = $1 ORDER BY created_at DESC",
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await?;
        let presence = sqlx::query_as::<_, ProctorPresence>(
            "SELECT * FROM proctor_presence WHERE schedule_id = $1 AND left_at IS NULL ORDER BY last_heartbeat_at DESC",
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await?;
        let violation_rules = sqlx::query_as::<_, ViolationRule>(
            "SELECT * FROM violation_rules WHERE schedule_id = $1 ORDER BY created_at DESC",
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(ProctorSessionDetail {
            schedule,
            runtime,
            sessions,
            alerts,
            audit_logs,
            notes,
            presence,
            violation_rules,
            degraded_live_mode: degraded.degraded,
        })
    }

    pub async fn live_mode(
        &self,
        schedule_id: Option<Uuid>,
        live_mode_enabled: bool,
    ) -> Result<DegradedLiveState, ProctoringError> {
        LiveModeService::new(self.pool.clone())
            .snapshot(live_mode_enabled, schedule_id)
            .await
            .map_err(ProctoringError::from)
    }

    pub async fn record_presence(
        &self,
        schedule_id: Uuid,
        proctor_id: Uuid,
        proctor_name: &str,
        req: ProctorPresenceRequest,
    ) -> Result<Vec<ProctorPresence>, ProctoringError> {
        let now = Utc::now();
        match req.action {
            PresenceAction::Join | PresenceAction::Heartbeat => {
                sqlx::query(
                    r#"
                    INSERT INTO proctor_presence (
                        id, schedule_id, proctor_id, proctor_name, status,
                        joined_at, last_heartbeat_at, left_at
                    )
                    VALUES ($1, $2, $3, $4, 'active', $5, $5, NULL)
                    ON CONFLICT (schedule_id, proctor_id) WHERE left_at IS NULL
                    DO UPDATE SET
                        proctor_name = EXCLUDED.proctor_name,
                        status = 'active',
                        last_heartbeat_at = EXCLUDED.last_heartbeat_at,
                        left_at = NULL
                    "#,
                )
                .bind(Uuid::new_v4())
                .bind(schedule_id)
                .bind(proctor_id)
                .bind(proctor_name)
                .bind(now)
                .execute(&self.pool)
                .await?;
            }
            PresenceAction::Leave => {
                sqlx::query(
                    r#"
                    UPDATE proctor_presence
                    SET status = 'left', left_at = $3, last_heartbeat_at = $3
                    WHERE schedule_id = $1 AND proctor_id = $2 AND left_at IS NULL
                    "#,
                )
                .bind(schedule_id)
                .bind(proctor_id)
                .bind(now)
                .execute(&self.pool)
                .await?;
            }
        }

        sqlx::query_as::<_, ProctorPresence>(
            "SELECT * FROM proctor_presence WHERE schedule_id = $1 AND left_at IS NULL ORDER BY last_heartbeat_at DESC",
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await
        .map_err(ProctoringError::from)
    }

    pub async fn end_section_now(
        &self,
        schedule_id: Uuid,
        actor_id: Uuid,
        req: AttemptCommandRequest,
    ) -> Result<ExamSessionRuntime, ProctoringError> {
        let runtime = self.load_runtime_row(schedule_id).await?;
        if runtime.status != RuntimeStatus::Live {
            return Err(ProctoringError::Conflict(
                "Runtime must be live before ending a section.".to_owned(),
            ));
        }

        let active_section_key = runtime.active_section_key.clone().ok_or_else(|| {
            ProctoringError::Conflict("No active section is available.".to_owned())
        })?;
        let sections = self.load_runtime_section_rows(runtime.id).await?;
        let active_index = sections
            .iter()
            .position(|section| section.section_key == active_section_key)
            .ok_or_else(|| {
                ProctoringError::Conflict("Active section row is missing.".to_owned())
            })?;
        let next_section = sections
            .iter()
            .skip(active_index + 1)
            .find(|section| section.status == SectionRuntimeStatus::Locked);
        let now = Utc::now();
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            UPDATE exam_session_runtime_sections
            SET
                status = $2,
                actual_end_at = $3,
                completion_reason = 'proctor_end',
                paused_at = NULL
            WHERE runtime_id = $1 AND section_key = $4
            "#,
        )
        .bind(runtime.id)
        .bind(SectionRuntimeStatus::Completed)
        .bind(now)
        .bind(&active_section_key)
        .execute(&mut *tx)
        .await?;

        let next_section_key = next_section.map(|section| section.section_key.clone());
        if let Some(section) = next_section {
            sqlx::query(
                r#"
                UPDATE exam_session_runtime_sections
                SET
                    status = $2,
                    available_at = COALESCE(available_at, $3),
                    actual_start_at = COALESCE(actual_start_at, $3)
                WHERE runtime_id = $1 AND section_key = $4
                "#,
            )
            .bind(runtime.id)
            .bind(SectionRuntimeStatus::Live)
            .bind(now)
            .bind(&section.section_key)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                r#"
                UPDATE exam_session_runtimes
                SET
                    active_section_key = $2,
                    current_section_key = $2,
                    current_section_remaining_seconds = $3,
                    updated_at = $4,
                    revision = revision + 1
                WHERE id = $1
                "#,
            )
            .bind(runtime.id)
            .bind(&section.section_key)
            .bind((section.planned_duration_minutes + section.extension_minutes) * 60)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                r#"
                UPDATE exam_session_runtimes
                SET
                    status = $2,
                    actual_end_at = $3,
                    active_section_key = NULL,
                    current_section_key = NULL,
                    current_section_remaining_seconds = 0,
                    waiting_for_next_section = false,
                    updated_at = $4,
                    revision = revision + 1
                WHERE id = $1
                "#,
            )
            .bind(runtime.id)
            .bind(RuntimeStatus::Completed)
            .bind(now)
            .bind(now)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "UPDATE exam_schedules SET status = 'completed', updated_at = $2, revision = revision + 1 WHERE id = $1",
            )
            .bind(schedule_id)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        }

        insert_control_event(
            &mut tx,
            runtime.id,
            schedule_id,
            runtime.exam_id,
            &actor_id.to_string(),
            "end_section_now",
            Some(&active_section_key),
            None,
            req.reason.as_deref(),
        )
        .await?;
        insert_audit_log(
            &mut tx,
            schedule_id,
            &actor_id.to_string(),
            "SECTION_END",
            None,
            Some(json!({ "sectionKey": active_section_key, "reason": req.reason })),
        )
        .await?;
        if let Some(next_key) = &next_section_key {
            insert_audit_log(
                &mut tx,
                schedule_id,
                &actor_id.to_string(),
                "SECTION_START",
                None,
                Some(json!({ "sectionKey": next_key })),
            )
            .await?;
        }
        OutboxRepository::enqueue_in_tx(
            &mut tx,
            "schedule_runtime",
            &schedule_id.to_string(),
            i64::from(runtime.revision + 1),
            "runtime_changed",
            &json!({ "scheduleId": schedule_id, "event": "end_section_now" }),
        )
        .await?;

        tx.commit().await?;
        SchedulingService::new(self.pool.clone())
            .get_runtime(&system_actor(), schedule_id)
            .await
            .map_err(map_scheduling_error)
    }

    pub async fn extend_section(
        &self,
        schedule_id: Uuid,
        actor_id: Uuid,
        req: ExtendSectionRequest,
    ) -> Result<ExamSessionRuntime, ProctoringError> {
        if req.minutes <= 0 {
            return Err(ProctoringError::Validation(
                "Extension minutes must be greater than zero.".to_owned(),
            ));
        }

        let runtime = self.load_runtime_row(schedule_id).await?;
        let active_section_key = runtime.active_section_key.clone().ok_or_else(|| {
            ProctoringError::Conflict("No active section is available.".to_owned())
        })?;
        let now = Utc::now();
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            UPDATE exam_session_runtime_sections
            SET
                extension_minutes = extension_minutes + $3,
                projected_end_at = COALESCE(projected_end_at, $2) + ($3 * interval '1 minute')
            WHERE runtime_id = $1 AND section_key = $4
            "#,
        )
        .bind(runtime.id)
        .bind(now)
        .bind(req.minutes)
        .bind(&active_section_key)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE exam_session_runtimes
            SET
                current_section_remaining_seconds = current_section_remaining_seconds + ($2 * 60),
                updated_at = $3,
                revision = revision + 1
            WHERE id = $1
            "#,
        )
        .bind(runtime.id)
        .bind(req.minutes)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        insert_control_event(
            &mut tx,
            runtime.id,
            schedule_id,
            runtime.exam_id,
            &actor_id.to_string(),
            "extend_section",
            Some(&active_section_key),
            Some(req.minutes),
            req.reason.as_deref(),
        )
        .await?;
        insert_audit_log(
            &mut tx,
            schedule_id,
            &actor_id.to_string(),
            "EXTENSION_GRANTED",
            None,
            Some(json!({ "sectionKey": active_section_key, "minutes": req.minutes, "reason": req.reason })),
        )
        .await?;
        OutboxRepository::enqueue_in_tx(
            &mut tx,
            "schedule_runtime",
            &schedule_id.to_string(),
            i64::from(runtime.revision + 1),
            "runtime_changed",
            &json!({ "scheduleId": schedule_id, "event": "extend_section" }),
        )
        .await?;

        tx.commit().await?;
        SchedulingService::new(self.pool.clone())
            .get_runtime(&system_actor(), schedule_id)
            .await
            .map_err(map_scheduling_error)
    }

    pub async fn complete_exam(
        &self,
        schedule_id: Uuid,
        actor_id: Uuid,
        req: CompleteExamRequest,
    ) -> Result<ExamSessionRuntime, ProctoringError> {
        let runtime = self.load_runtime_row(schedule_id).await?;
        if matches!(
            runtime.status,
            RuntimeStatus::Completed | RuntimeStatus::Cancelled
        ) {
            return SchedulingService::new(self.pool.clone())
                .get_runtime(&system_actor(), schedule_id)
                .await
                .map_err(map_scheduling_error);
        }

        let now = Utc::now();
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            UPDATE exam_session_runtimes
            SET
                status = $2,
                actual_end_at = $3,
                active_section_key = NULL,
                current_section_key = NULL,
                current_section_remaining_seconds = 0,
                waiting_for_next_section = false,
                updated_at = $4,
                revision = revision + 1
            WHERE id = $1
            "#,
        )
        .bind(runtime.id)
        .bind(RuntimeStatus::Completed)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            UPDATE exam_session_runtime_sections
            SET
                status = $2,
                actual_end_at = COALESCE(actual_end_at, $3),
                completion_reason = COALESCE(completion_reason, 'proctor_complete'),
                paused_at = NULL
            WHERE runtime_id = $1
            "#,
        )
        .bind(runtime.id)
        .bind(SectionRuntimeStatus::Completed)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE exam_schedules SET status = 'completed', updated_at = $2, revision = revision + 1 WHERE id = $1",
        )
        .bind(schedule_id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        insert_control_event(
            &mut tx,
            runtime.id,
            schedule_id,
            runtime.exam_id,
            &actor_id.to_string(),
            "complete_runtime",
            None,
            None,
            req.reason.as_deref(),
        )
        .await?;
        insert_audit_log(
            &mut tx,
            schedule_id,
            &actor_id.to_string(),
            "SESSION_END",
            None,
            Some(json!({ "reason": req.reason })),
        )
        .await?;
        OutboxRepository::enqueue_in_tx(
            &mut tx,
            "schedule_runtime",
            &schedule_id.to_string(),
            i64::from(runtime.revision + 1),
            "runtime_changed",
            &json!({ "scheduleId": schedule_id, "event": "complete_exam" }),
        )
        .await?;

        tx.commit().await?;
        SchedulingService::new(self.pool.clone())
            .get_runtime(&system_actor(), schedule_id)
            .await
            .map_err(map_scheduling_error)
    }

    pub async fn warn_attempt(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
        actor_id: Uuid,
        req: AttemptCommandRequest,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        let description = req
            .message
            .clone()
            .unwrap_or_else(|| "Proctor warning issued.".to_owned());
        let warning_id = Uuid::new_v4();
        let now = Utc::now();
        let warning_json = json!({
            "id": warning_id,
            "type": "PROCTOR_WARNING",
            "severity": "medium",
            "timestamp": now,
            "description": description
        });
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO student_violation_events (
                id, schedule_id, attempt_id, violation_type, severity, description, payload, created_at
            )
            VALUES ($1, $2, $3, 'PROCTOR_WARNING', 'medium', $4, $5, $6)
            "#,
        )
        .bind(warning_id)
        .bind(schedule_id)
        .bind(attempt_id)
        .bind(&description)
        .bind(json!({ "message": description }))
        .bind(now)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE student_attempts
            SET
                proctor_status = 'warned',
                proctor_note = $3,
                proctor_updated_at = $4,
                proctor_updated_by = $5,
                last_warning_id = $6,
                violations_snapshot = COALESCE(violations_snapshot, '[]'::jsonb) || $7::jsonb,
                updated_at = $4,
                revision = revision + 1
            WHERE id = $1 AND schedule_id = $2
            "#,
        )
        .bind(attempt_id)
        .bind(schedule_id)
        .bind(&description)
        .bind(now)
        .bind(&actor_id.to_string())
        .bind(warning_id.to_string())
        .bind(&warning_json)
        .execute(&mut *tx)
        .await?;

        insert_audit_log(
            &mut tx,
            schedule_id,
            &actor_id.to_string(),
            "STUDENT_WARN",
            Some(attempt_id),
            Some(json!({ "message": req.message, "warningId": warning_id, "severity": "medium" })),
        )
        .await?;
        OutboxRepository::enqueue_in_tx(
            &mut tx,
            "schedule_roster",
            &schedule_id.to_string(),
            0,
            "roster_changed",
            &json!({ "scheduleId": schedule_id, "event": "warn_attempt", "attemptId": attempt_id }),
        )
        .await?;

        tx.commit().await?;
        self.load_student_session(schedule_id, attempt_id).await
    }

    pub async fn pause_attempt(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
        actor_id: Uuid,
        req: AttemptCommandRequest,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        self.update_attempt_status(
            schedule_id,
            attempt_id,
            actor_id,
            "paused",
            None,
            "STUDENT_PAUSE",
            req,
        )
        .await
    }

    pub async fn resume_attempt(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
        actor_id: Uuid,
        req: AttemptCommandRequest,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        self.update_attempt_status(
            schedule_id,
            attempt_id,
            actor_id,
            "active",
            None,
            "STUDENT_RESUME",
            req,
        )
        .await
    }

    pub async fn terminate_attempt(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
        actor_id: Uuid,
        req: AttemptCommandRequest,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        self.update_attempt_status(
            schedule_id,
            attempt_id,
            actor_id,
            "terminated",
            Some("post-exam"),
            "STUDENT_TERMINATE",
            req,
        )
        .await
    }

    #[tracing::instrument(skip(self), fields(alert_id = %alert_id, actor_id = %actor_id))]
    pub async fn acknowledge_alert(
        &self,
        alert_id: Uuid,
        actor_id: Uuid,
        _req: AlertAckRequest,
    ) -> Result<SessionAuditLog, ProctoringError> {
        sqlx::query_as::<_, SessionAuditLog>(
            r#"
            UPDATE session_audit_logs
            SET acknowledged_at = now(), acknowledged_by = $2
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(alert_id)
        .bind(&actor_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ProctoringError::NotFound)
    }

    async fn update_attempt_status(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
        actor_id: Uuid,
        proctor_status: &str,
        phase: Option<&str>,
        action_type: &str,
        req: AttemptCommandRequest,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        let now = Utc::now();
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            UPDATE student_attempts
            SET
                proctor_status = $3,
                phase = COALESCE($4, phase),
                proctor_note = COALESCE($5, proctor_note),
                proctor_updated_at = $6,
                proctor_updated_by = $7,
                updated_at = $6,
                revision = revision + 1
            WHERE id = $1 AND schedule_id = $2
            "#,
        )
        .bind(attempt_id)
        .bind(schedule_id)
        .bind(proctor_status)
        .bind(phase)
        .bind(req.reason.clone().or(req.message.clone()))
        .bind(now)
        .bind(&actor_id.to_string())
        .execute(&mut *tx)
        .await?;

        insert_audit_log(
            &mut tx,
            schedule_id,
            &actor_id.to_string(),
            action_type,
            Some(attempt_id),
            Some(json!({ "message": req.message, "reason": req.reason })),
        )
        .await?;
        OutboxRepository::enqueue_in_tx(
            &mut tx,
            "schedule_roster",
            &schedule_id.to_string(),
            0,
            "roster_changed",
            &json!({ "scheduleId": schedule_id, "event": action_type, "attemptId": attempt_id }),
        )
        .await?;

        tx.commit().await?;
        self.load_student_session(schedule_id, attempt_id).await
    }

    async fn load_student_sessions(
        &self,
        schedule_id: Uuid,
        runtime: &ExamSessionRuntime,
    ) -> Result<Vec<StudentSessionSummary>, ProctoringError> {
        let rows = sqlx::query_as::<_, AttemptProjectionRow>(
            r#"
            SELECT
                id,
                candidate_id,
                candidate_name,
                candidate_email,
                schedule_id,
                current_module,
                phase,
                integrity,
                violations_snapshot,
                exam_id,
                exam_title,
                updated_at,
                COALESCE(proctor_status, 'active') AS proctor_status,
                last_warning_id
            FROM student_attempts
            WHERE schedule_id = $1
            ORDER BY updated_at DESC
            "#,
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| attempt_row_to_session(row, runtime))
            .collect())
    }

    async fn load_student_session(
        &self,
        schedule_id: Uuid,
        attempt_id: Uuid,
    ) -> Result<StudentSessionSummary, ProctoringError> {
        let runtime = SchedulingService::new(self.pool.clone())
            .get_runtime(&system_actor(), schedule_id)
            .await
            .map_err(map_scheduling_error)?;
        let row = sqlx::query_as::<_, AttemptProjectionRow>(
            r#"
            SELECT
                id,
                candidate_id,
                candidate_name,
                candidate_email,
                schedule_id,
                current_module,
                phase,
                integrity,
                violations_snapshot,
                exam_id,
                exam_title,
                updated_at,
                COALESCE(proctor_status, 'active') AS proctor_status,
                last_warning_id
            FROM student_attempts
            WHERE id = $1 AND schedule_id = $2
            "#,
        )
        .bind(attempt_id)
        .bind(schedule_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ProctoringError::NotFound)?;

        Ok(attempt_row_to_session(row, &runtime))
    }

    async fn load_runtime_row(&self, schedule_id: Uuid) -> Result<RuntimeRow, ProctoringError> {
        sqlx::query_as::<_, RuntimeRow>(
            "SELECT * FROM exam_session_runtimes WHERE schedule_id = $1",
        )
        .bind(schedule_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ProctoringError::NotFound)
    }

    async fn load_runtime_section_rows(
        &self,
        runtime_id: Uuid,
    ) -> Result<Vec<RuntimeSectionRow>, ProctoringError> {
        sqlx::query_as::<_, RuntimeSectionRow>(
            "SELECT * FROM exam_session_runtime_sections WHERE runtime_id = $1 ORDER BY section_order ASC",
        )
        .bind(runtime_id)
        .fetch_all(&self.pool)
        .await
        .map_err(ProctoringError::from)
    }

    async fn load_audit_logs(
        &self,
        schedule_id: Uuid,
    ) -> Result<Vec<SessionAuditLog>, ProctoringError> {
        sqlx::query_as::<_, SessionAuditLog>(
            "SELECT * FROM session_audit_logs WHERE schedule_id = $1 ORDER BY created_at DESC",
        )
        .bind(schedule_id)
        .fetch_all(&self.pool)
        .await
        .map_err(ProctoringError::from)
    }
}

#[derive(FromRow)]
struct AttemptProjectionRow {
    id: Uuid,
    candidate_id: String,
    candidate_name: String,
    candidate_email: String,
    schedule_id: Uuid,
    current_module: String,
    phase: String,
    integrity: Value,
    violations_snapshot: Value,
    exam_id: Uuid,
    exam_title: String,
    updated_at: DateTime<Utc>,
    proctor_status: String,
    last_warning_id: Option<String>,
}

#[derive(FromRow)]
struct RuntimeRow {
    id: Uuid,
    exam_id: Uuid,
    status: RuntimeStatus,
    active_section_key: Option<String>,
    revision: i32,
}

#[derive(FromRow)]
struct RuntimeSectionRow {
    section_key: String,
    planned_duration_minutes: i32,
    extension_minutes: i32,
    status: SectionRuntimeStatus,
}

fn system_actor() -> ActorContext {
    ActorContext::new(Uuid::nil(), ActorRole::Admin)
}

fn map_scheduling_error(error: SchedulingError) -> ProctoringError {
    match error {
        SchedulingError::Database(error) => ProctoringError::Database(error),
        SchedulingError::Conflict(message) => ProctoringError::Conflict(message),
        SchedulingError::NotFound => ProctoringError::NotFound,
        SchedulingError::Validation(message) => ProctoringError::Validation(message),
    }
}

fn attempt_row_to_session(
    row: AttemptProjectionRow,
    runtime: &ExamSessionRuntime,
) -> StudentSessionSummary {
    let heartbeat_status = row
        .integrity
        .get("lastHeartbeatStatus")
        .and_then(Value::as_str)
        .unwrap_or("idle");
    let status = if row.proctor_status == "terminated" || row.phase == "post-exam" {
        "terminated".to_owned()
    } else if row.proctor_status == "paused" {
        "paused".to_owned()
    } else if heartbeat_status == "lost" {
        "connecting".to_owned()
    } else if row.proctor_status == "warned" {
        "warned".to_owned()
    } else if row.phase == "exam" {
        "active".to_owned()
    } else {
        "idle".to_owned()
    };
    let runtime_section_status = runtime
        .sections
        .iter()
        .find(|section| Some(section.section_key.clone()) == runtime.current_section_key)
        .map(|section| section_status_name(&section.status));
    let last_activity = row
        .integrity
        .get("lastHeartbeatAt")
        .and_then(Value::as_str)
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
        .unwrap_or(row.updated_at);
    let warnings = row
        .violations_snapshot
        .as_array()
        .map(|violations| {
            violations
                .iter()
                .filter(|entry| {
                    matches!(
                        entry.get("type").and_then(Value::as_str),
                        Some("PROCTOR_WARNING") | Some("AUTO_WARNING")
                    )
                })
                .count() as i32
        })
        .unwrap_or_else(|| i32::from(row.last_warning_id.is_some()));

    StudentSessionSummary {
        attempt_id: row.id,
        student_id: row.candidate_id,
        student_name: row.candidate_name,
        student_email: row.candidate_email,
        schedule_id: row.schedule_id,
        status,
        current_section: row.current_module,
        time_remaining: runtime.current_section_remaining_seconds,
        runtime_status: runtime.status.clone(),
        runtime_current_section: runtime.current_section_key.clone(),
        runtime_time_remaining_seconds: runtime.current_section_remaining_seconds,
        runtime_section_status,
        runtime_waiting: runtime.waiting_for_next_section,
        violations: row.violations_snapshot,
        warnings,
        last_activity,
        exam_id: row.exam_id,
        exam_name: row.exam_title,
    }
}

fn build_alerts(
    audit_logs: &[SessionAuditLog],
    sessions: &[StudentSessionSummary],
) -> Vec<ProctorAlert> {
    audit_logs
        .iter()
        .filter(|log| {
            matches!(
                log.action_type.as_str(),
                "HEARTBEAT_LOST"
                    | "DEVICE_CONTINUITY_FAILED"
                    | "NETWORK_DISCONNECTED"
                    | "AUTO_ACTION"
                    | "STUDENT_WARN"
                    | "STUDENT_PAUSE"
                    | "STUDENT_TERMINATE"
            )
        })
        .map(|log| {
            let session = log
                .target_student_id
                .and_then(|target| sessions.iter().find(|session| session.attempt_id == target));
            let severity = log
                .payload
                .as_ref()
                .and_then(|payload| payload.get("severity"))
                .and_then(Value::as_str)
                .unwrap_or(match log.action_type.as_str() {
                    "DEVICE_CONTINUITY_FAILED" | "STUDENT_TERMINATE" => "critical",
                    "HEARTBEAT_LOST" | "NETWORK_DISCONNECTED" => "high",
                    "STUDENT_WARN" => "medium",
                    _ => "medium",
                })
                .to_owned();
            let message = log
                .payload
                .as_ref()
                .and_then(|payload| payload.get("message").or_else(|| payload.get("reason")))
                .and_then(Value::as_str)
                .unwrap_or_else(|| default_alert_message(&log.action_type))
                .to_owned();

            ProctorAlert {
                id: log.id,
                severity,
                alert_type: log.action_type.clone(),
                student_name: session
                    .map(|session| session.student_name.clone())
                    .unwrap_or_else(|| "Candidate".to_owned()),
                student_id: session
                    .map(|session| session.student_id.clone())
                    .unwrap_or_else(|| "unknown".to_owned()),
                timestamp: log.created_at,
                message,
                is_acknowledged: log.acknowledged_at.is_some(),
            }
        })
        .collect()
}

fn default_alert_message(action_type: &str) -> &'static str {
    match action_type {
        "HEARTBEAT_LOST" => "Candidate heartbeat was lost.",
        "DEVICE_CONTINUITY_FAILED" => "Device continuity validation failed.",
        "NETWORK_DISCONNECTED" => "Candidate went offline.",
        "STUDENT_WARN" => "Proctor warning issued.",
        "STUDENT_PAUSE" => "Candidate session paused by proctor.",
        "STUDENT_TERMINATE" => "Candidate session terminated by proctor.",
        _ => "Monitoring alert detected.",
    }
}

fn section_status_name(status: &SectionRuntimeStatus) -> String {
    match status {
        SectionRuntimeStatus::Locked => "locked",
        SectionRuntimeStatus::Live => "live",
        SectionRuntimeStatus::Paused => "paused",
        SectionRuntimeStatus::Completed => "completed",
    }
    .to_owned()
}

#[allow(clippy::too_many_arguments)]
async fn insert_control_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    runtime_id: Uuid,
    schedule_id: Uuid,
    exam_id: Uuid,
    actor_id: &str,
    action: &str,
    section_key: Option<&str>,
    minutes: Option<i32>,
    reason: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO cohort_control_events (
            id, schedule_id, runtime_id, exam_id, actor_id, action, section_key, minutes, reason, payload, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(schedule_id)
    .bind(runtime_id)
    .bind(exam_id)
    .bind(actor_id)
    .bind(action)
    .bind(section_key)
    .bind(minutes)
    .bind(reason)
    .bind(json!({}))
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn insert_audit_log(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    schedule_id: Uuid,
    actor: &str,
    action_type: &str,
    target_student_id: Option<Uuid>,
    payload: Option<Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO session_audit_logs (
            id, schedule_id, actor, action_type, target_student_id, payload, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(schedule_id)
    .bind(actor)
    .bind(action_type)
    .bind(target_student_id)
    .bind(payload)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
