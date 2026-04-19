use chrono::Utc;
use ielts_backend_domain::{
    grading::{
        ActorActionRequest, GradingSession, GradingSessionDetail, GradingSessionStatus,
        OverallGradingStatus, ReleaseEvent, ReleaseNowRequest, ReleaseStatus, ResultsAnalytics,
        ReviewAction, ReviewDraft, SaveReviewDraftRequest, ScheduleReleaseRequest,
        SectionGradingStatus, SectionSubmission, StartReviewRequest, StudentResult,
        StudentSubmission, SubmissionReviewBundle, WritingTaskSubmission,
    },
    schedule::ScheduleStatus,
};
use serde_json::{json, Map, Value};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum GradingError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct GradingService {
    pool: PgPool,
}

impl GradingService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_sessions(&self) -> Result<Vec<GradingSession>, GradingError> {
        self.ensure_materialized_state().await?;

        sqlx::query_as::<_, GradingSession>(
            "SELECT * FROM grading_sessions ORDER BY updated_at DESC, start_time DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(GradingError::from)
    }

    pub async fn get_session_detail(
        &self,
        session_id: Uuid,
    ) -> Result<GradingSessionDetail, GradingError> {
        self.ensure_materialized_state().await?;

        let session =
            sqlx::query_as::<_, GradingSession>("SELECT * FROM grading_sessions WHERE id = $1")
                .bind(session_id)
                .fetch_optional(&self.pool)
                .await?
                .ok_or(GradingError::NotFound)?;
        let submissions = sqlx::query_as::<_, StudentSubmission>(
            "SELECT * FROM student_submissions WHERE schedule_id = $1 ORDER BY submitted_at DESC",
        )
        .bind(session.schedule_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(GradingSessionDetail {
            session,
            submissions,
        })
    }

    pub async fn get_submission_bundle(
        &self,
        submission_id: Uuid,
    ) -> Result<SubmissionReviewBundle, GradingError> {
        self.ensure_materialized_state().await?;

        let submission = sqlx::query_as::<_, StudentSubmission>(
            "SELECT * FROM student_submissions WHERE id = $1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(GradingError::NotFound)?;
        let sections = sqlx::query_as::<_, SectionSubmission>(
            "SELECT * FROM section_submissions WHERE submission_id = $1 ORDER BY section ASC",
        )
        .bind(submission_id)
        .fetch_all(&self.pool)
        .await?;
        let writing_tasks = sqlx::query_as::<_, WritingTaskSubmission>(
            "SELECT * FROM writing_task_submissions WHERE submission_id = $1 ORDER BY task_id ASC",
        )
        .bind(submission_id)
        .fetch_all(&self.pool)
        .await?;
        let review_draft = sqlx::query_as::<_, ReviewDraft>(
            "SELECT * FROM review_drafts WHERE submission_id = $1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(SubmissionReviewBundle {
            submission,
            sections,
            writing_tasks,
            review_draft,
        })
    }

    pub async fn start_review(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        _req: StartReviewRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.ensure_materialized_state().await?;
        if let Some(existing) =
            sqlx::query_as::<_, ReviewDraft>("SELECT * FROM review_drafts WHERE submission_id = $1")
                .bind(submission_id)
                .fetch_optional(&self.pool)
                .await?
        {
            return Ok(existing);
        }

        let submission = sqlx::query_as::<_, StudentSubmission>(
            "SELECT * FROM student_submissions WHERE id = $1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(GradingError::NotFound)?;
        let actor_id_str = actor_id.to_string();
        let draft = sqlx::query_as::<_, ReviewDraft>(
            r#"
            INSERT INTO review_drafts (
                id, submission_id, student_id, teacher_id, release_status,
                section_drafts, annotations, drawings, teacher_summary, checklist,
                has_unsaved_changes, created_at, updated_at, revision
            )
            VALUES (
                $1, $2, $3, $4, 'draft',
                '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
                false, now(), now(), 0
            )
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(submission_id)
        .bind(submission.student_id)
        .bind(&actor_id_str)
        .fetch_one(&self.pool)
        .await?;

        sqlx::query(
            r#"
            UPDATE student_submissions
            SET
                grading_status = 'in_progress',
                assigned_teacher_id = $2,
                assigned_teacher_name = $3,
                updated_at = now()
            WHERE id = $1
            "#,
        )
        .bind(submission_id)
        .bind(&actor_id_str)
        .bind(actor_name)
        .execute(&self.pool)
        .await?;
        self.insert_review_event(
            submission_id,
            &actor_id_str,
            actor_name,
            ReviewAction::ReviewStarted,
            None,
            Some("submitted"),
            Some("in_progress"),
            None,
        )
        .await?;

        Ok(draft)
    }

    pub async fn get_review_draft(&self, submission_id: Uuid) -> Result<ReviewDraft, GradingError> {
        self.ensure_materialized_state().await?;

        sqlx::query_as::<_, ReviewDraft>("SELECT * FROM review_drafts WHERE submission_id = $1")
            .bind(submission_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(GradingError::NotFound)
    }

    #[tracing::instrument(skip(self, req), fields(submission_id = %submission_id))]
    pub async fn save_review_draft(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        req: SaveReviewDraftRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.ensure_materialized_state().await?;
        let existing = self.get_review_draft(submission_id).await?;
        if let Some(revision) = req.revision {
            if revision != existing.revision {
                return Err(GradingError::Conflict(
                    "Review draft has been modified by another grader.".to_owned(),
                ));
            }
        }

        let next_release_status = req
            .release_status
            .unwrap_or_else(|| existing.release_status.clone());
        let actor_id_str = actor_id.to_string();
        let draft = sqlx::query_as::<_, ReviewDraft>(
            r#"
            UPDATE review_drafts
            SET
                teacher_id = $2,
                release_status = $3,
                section_drafts = $4,
                annotations = $5,
                drawings = $6,
                overall_feedback = $7,
                student_visible_notes = $8,
                internal_notes = $9,
                teacher_summary = $10,
                checklist = $11,
                has_unsaved_changes = $12,
                last_auto_save_at = now(),
                updated_at = now(),
                revision = revision + 1
            WHERE submission_id = $1
            RETURNING *
            "#,
        )
        .bind(submission_id)
        .bind(&actor_id_str)
        .bind(next_release_status)
        .bind(req.section_drafts)
        .bind(req.annotations)
        .bind(req.drawings)
        .bind(req.overall_feedback)
        .bind(req.student_visible_notes)
        .bind(req.internal_notes)
        .bind(req.teacher_summary)
        .bind(req.checklist)
        .bind(req.has_unsaved_changes)
        .fetch_one(&self.pool)
        .await?;

        self.insert_review_event(
            submission_id,
            &actor_id_str,
            &actor_id_str,
            ReviewAction::DraftSaved,
            None,
            None,
            None,
            None,
        )
        .await?;

        Ok(draft)
    }

    pub async fn mark_grading_complete(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        _req: ActorActionRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.transition_release_status(
            submission_id,
            actor_id,
            actor_name,
            ReleaseStatus::GradingComplete,
            OverallGradingStatus::GradingComplete,
            ReviewAction::ReviewFinalized,
        )
        .await
    }

    pub async fn mark_ready_to_release(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        _req: ActorActionRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.transition_release_status(
            submission_id,
            actor_id,
            actor_name,
            ReleaseStatus::ReadyToRelease,
            OverallGradingStatus::ReadyToRelease,
            ReviewAction::MarkReadyToRelease,
        )
        .await
    }

    pub async fn reopen_review(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        _req: ActorActionRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.transition_release_status(
            submission_id,
            actor_id,
            actor_name,
            ReleaseStatus::Reopened,
            OverallGradingStatus::Reopened,
            ReviewAction::ReviewReopened,
        )
        .await
    }

    #[tracing::instrument(skip(self, req), fields(submission_id = %submission_id))]
    pub async fn release_now(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        req: ReleaseNowRequest,
    ) -> Result<StudentResult, GradingError> {
        self.ensure_materialized_state().await?;

        let submission = sqlx::query_as::<_, StudentSubmission>(
            "SELECT * FROM student_submissions WHERE id = $1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(GradingError::NotFound)?;
        let draft = self.get_review_draft(submission_id).await?;
        let section_bands = build_section_bands(&draft.section_drafts);
        let overall_band = average_band(&section_bands);
        let now = Utc::now();
        let actor_id_str = actor_id.to_string();

        let existing = sqlx::query_as::<_, StudentResult>(
            "SELECT * FROM student_results WHERE submission_id = $1 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?;
        let revision_reason = req.revision_reason.clone();
        let result = if let Some(existing) = existing {
            sqlx::query_as::<_, StudentResult>(
                r#"
                UPDATE student_results
                SET
                    release_status = 'released',
                    released_at = $2,
                    released_by = $3,
                    overall_band = $4,
                    section_bands = $5,
                    teacher_summary = $6,
                    version = version + 1,
                    revision_reason = $7,
                    updated_at = $2
                WHERE id = $1
                RETURNING *
                "#,
            )
            .bind(existing.id)
            .bind(now)
            .bind(&actor_id_str)
            .bind(overall_band)
            .bind(&section_bands)
            .bind(draft.teacher_summary.clone())
            .bind(revision_reason.clone())
            .fetch_one(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, StudentResult>(
                r#"
                INSERT INTO student_results (
                    id, submission_id, student_id, student_name, release_status, released_at,
                    released_by, overall_band, section_bands, writing_results,
                    teacher_summary, version, created_at, updated_at
                )
                VALUES (
                    $1, $2, $3, $4, 'released', $5,
                    $6, $7, $8, '{}'::jsonb,
                    $9, 1, $5, $5
                )
                RETURNING *
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(submission_id)
            .bind(submission.student_id)
            .bind(submission.student_name)
            .bind(now)
            .bind(&actor_id_str)
            .bind(overall_band)
            .bind(&section_bands)
            .bind(draft.teacher_summary.clone())
            .fetch_one(&self.pool)
            .await?
        };

        sqlx::query(
            "UPDATE review_drafts SET release_status = 'released', updated_at = $2 WHERE submission_id = $1",
        )
        .bind(submission_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        sqlx::query(
            "UPDATE student_submissions SET grading_status = 'released', updated_at = $2 WHERE id = $1",
        )
        .bind(submission_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO release_events (id, result_id, submission_id, actor_id, action, payload, created_at)
            VALUES ($1, $2, $3, $4, 'released', $5, $6)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(result.id)
        .bind(submission_id)
        .bind(&actor_id_str)
        .bind(json!({ "overallBand": overall_band, "revisionReason": revision_reason }))
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.insert_review_event(
            submission_id,
            &actor_id_str,
            &actor_id_str,
            ReviewAction::ReleaseNow,
            None,
            Some("ready_to_release"),
            Some("released"),
            Some(json!({ "releasedBy": actor_id_str })),
        )
        .await?;

        Ok(result)
    }

    #[tracing::instrument(skip(self, req), fields(submission_id = %submission_id))]
    pub async fn schedule_release(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        req: ScheduleReleaseRequest,
    ) -> Result<ReviewDraft, GradingError> {
        self.ensure_materialized_state().await?;

        let submission = sqlx::query_as::<_, StudentSubmission>(
            "SELECT * FROM student_submissions WHERE id = $1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(GradingError::NotFound)?;
        let draft = self.get_review_draft(submission_id).await?;
        let section_bands = build_section_bands(&draft.section_drafts);
        let overall_band = average_band(&section_bands);
        let now = Utc::now();
        let actor_id_str = actor_id.to_string();

        let existing = sqlx::query_as::<_, StudentResult>(
            "SELECT * FROM student_results WHERE submission_id = $1 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await?;
        if let Some(existing) = existing {
            sqlx::query_as::<_, StudentResult>(
                r#"
                UPDATE student_results
                SET
                    release_status = 'ready_to_release',
                    released_at = NULL,
                    released_by = NULL,
                    scheduled_release_date = $2,
                    overall_band = $3,
                    section_bands = $4,
                    teacher_summary = $5,
                    updated_at = $6
                WHERE id = $1
                RETURNING *
                "#,
            )
            .bind(existing.id)
            .bind(req.release_at)
            .bind(overall_band)
            .bind(&section_bands)
            .bind(draft.teacher_summary.clone())
            .bind(now)
            .fetch_one(&self.pool)
            .await?;
        } else {
            sqlx::query_as::<_, StudentResult>(
                r#"
                INSERT INTO student_results (
                    id, submission_id, student_id, student_name, release_status,
                    scheduled_release_date, overall_band, section_bands, writing_results,
                    teacher_summary, version, created_at, updated_at
                )
                VALUES (
                    $1, $2, $3, $4, 'ready_to_release',
                    $5, $6, $7, '{}'::jsonb,
                    $8, 1, $9, $9
                )
                RETURNING *
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(submission_id)
            .bind(submission.student_id)
            .bind(submission.student_name)
            .bind(req.release_at)
            .bind(overall_band)
            .bind(&section_bands)
            .bind(draft.teacher_summary.clone())
            .bind(now)
            .fetch_one(&self.pool)
            .await?;
        }

        let updated_draft = sqlx::query_as::<_, ReviewDraft>(
            r#"
            UPDATE review_drafts
            SET release_status = 'ready_to_release', has_unsaved_changes = false, updated_at = $2
            WHERE submission_id = $1
            RETURNING *
            "#,
        )
        .bind(submission_id)
        .bind(now)
        .fetch_one(&self.pool)
        .await?;
        sqlx::query(
            "UPDATE student_submissions SET grading_status = 'ready_to_release', updated_at = $2 WHERE id = $1",
        )
        .bind(submission_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO release_events (id, result_id, submission_id, actor_id, action, payload, created_at)
            SELECT
                $1,
                id,
                submission_id,
                $2,
                'scheduled',
                $3,
                $4
            FROM student_results
            WHERE submission_id = $5
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(&actor_id_str)
        .bind(json!({
            "overallBand": overall_band,
            "scheduledReleaseDate": req.release_at,
            "teacherName": actor_name,
        }))
        .bind(now)
        .bind(submission_id)
        .execute(&self.pool)
        .await?;

        Ok(updated_draft)
    }

    pub async fn list_results(&self) -> Result<Vec<StudentResult>, GradingError> {
        self.ensure_materialized_state().await?;

        sqlx::query_as::<_, StudentResult>(
            "SELECT * FROM student_results ORDER BY updated_at DESC, created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(GradingError::from)
    }

    pub async fn get_result(&self, result_id: Uuid) -> Result<StudentResult, GradingError> {
        sqlx::query_as::<_, StudentResult>("SELECT * FROM student_results WHERE id = $1")
            .bind(result_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(GradingError::NotFound)
    }

    pub async fn get_result_events(
        &self,
        result_id: Uuid,
    ) -> Result<Vec<ReleaseEvent>, GradingError> {
        sqlx::query_as::<_, ReleaseEvent>(
            "SELECT * FROM release_events WHERE result_id = $1 ORDER BY created_at DESC",
        )
        .bind(result_id)
        .fetch_all(&self.pool)
        .await
        .map_err(GradingError::from)
    }

    pub async fn analytics(&self) -> Result<ResultsAnalytics, GradingError> {
        self.ensure_materialized_state().await?;

        let total_results: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM student_results")
            .fetch_one(&self.pool)
            .await?;
        let released_results: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM student_results WHERE release_status = 'released'",
        )
        .fetch_one(&self.pool)
        .await?;
        let ready_to_release: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM student_results WHERE release_status = 'ready_to_release'",
        )
        .fetch_one(&self.pool)
        .await?;
        let average_overall_band: f64 =
            sqlx::query_scalar("SELECT COALESCE(AVG(overall_band), 0) FROM student_results")
                .fetch_one(&self.pool)
                .await?;

        Ok(ResultsAnalytics {
            total_results,
            released_results,
            ready_to_release,
            average_overall_band,
        })
    }

    pub async fn export_results(&self) -> Result<Value, GradingError> {
        let results = self.list_results().await?;
        Ok(json!({
            "format": "json",
            "generatedAt": Utc::now(),
            "count": results.len(),
            "items": results,
        }))
    }

    async fn transition_release_status(
        &self,
        submission_id: Uuid,
        actor_id: Uuid,
        actor_name: &str,
        release_status: ReleaseStatus,
        grading_status: OverallGradingStatus,
        event: ReviewAction,
    ) -> Result<ReviewDraft, GradingError> {
        self.ensure_materialized_state().await?;
        let actor_id_str = actor_id.to_string();
        let draft = sqlx::query_as::<_, ReviewDraft>(
            r#"
            UPDATE review_drafts
            SET release_status = $2, updated_at = now(), revision = revision + 1
            WHERE submission_id = $1
            RETURNING *
            "#,
        )
        .bind(submission_id)
        .bind(release_status)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(GradingError::NotFound)?;
        sqlx::query(
            "UPDATE student_submissions SET grading_status = $2, updated_at = now() WHERE id = $1",
        )
        .bind(submission_id)
        .bind(grading_status)
        .execute(&self.pool)
        .await?;
        self.insert_review_event(
            submission_id,
            &actor_id_str,
            actor_name,
            event,
            None,
            None,
            None,
            None,
        )
        .await?;

        Ok(draft)
    }

    #[allow(clippy::too_many_arguments)]
    async fn insert_review_event(
        &self,
        submission_id: Uuid,
        teacher_id: &str,
        teacher_name: &str,
        action: ReviewAction,
        section: Option<&str>,
        from_status: Option<&str>,
        to_status: Option<&str>,
        payload: Option<Value>,
    ) -> Result<(), GradingError> {
        sqlx::query(
            r#"
            INSERT INTO review_events (
                id, submission_id, teacher_id, teacher_name, action, section,
                from_status, to_status, payload, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(submission_id)
        .bind(teacher_id)
        .bind(teacher_name)
        .bind(action)
        .bind(section)
        .bind(from_status)
        .bind(to_status)
        .bind(payload)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn ensure_materialized_state(&self) -> Result<(), GradingError> {
        self.sync_sessions_from_schedules().await?;
        self.sync_submissions_from_attempts().await?;
        self.refresh_session_counters().await?;
        Ok(())
    }

    async fn sync_sessions_from_schedules(&self) -> Result<(), GradingError> {
        let schedules = sqlx::query_as::<_, ScheduleSeedRow>(
            r#"
            SELECT
                id,
                exam_id,
                exam_title,
                published_version_id,
                cohort_name,
                institution,
                start_time,
                end_time,
                status,
                created_at,
                created_by,
                updated_at
            FROM exam_schedules
            ORDER BY start_time ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for schedule in schedules {
            sqlx::query(
                r#"
                INSERT INTO grading_sessions (
                    id, schedule_id, exam_id, exam_title, published_version_id, cohort_name,
                    institution, start_time, end_time, status, created_at, created_by, updated_at
                )
                VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (schedule_id)
                DO UPDATE SET
                    exam_id = EXCLUDED.exam_id,
                    exam_title = EXCLUDED.exam_title,
                    published_version_id = EXCLUDED.published_version_id,
                    cohort_name = EXCLUDED.cohort_name,
                    institution = EXCLUDED.institution,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
                "#,
            )
            .bind(schedule.id)
            .bind(schedule.exam_id)
            .bind(schedule.exam_title)
            .bind(schedule.published_version_id)
            .bind(schedule.cohort_name)
            .bind(schedule.institution)
            .bind(schedule.start_time)
            .bind(schedule.end_time)
            .bind(map_schedule_status(schedule.status))
            .bind(schedule.created_at)
            .bind(schedule.created_by)
            .bind(schedule.updated_at)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    async fn sync_submissions_from_attempts(&self) -> Result<(), GradingError> {
        let attempts = sqlx::query_as::<_, AttemptSubmissionRow>(
            r#"
            SELECT
                a.id,
                a.schedule_id,
                a.exam_id,
                a.published_version_id,
                a.candidate_id,
                a.candidate_name,
                a.candidate_email,
                s.cohort_name,
                a.submitted_at,
                a.final_submission
            FROM student_attempts a
            JOIN exam_schedules s ON s.id = a.schedule_id
            WHERE a.final_submission IS NOT NULL
            ORDER BY a.updated_at ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for attempt in attempts {
            let submitted_at = attempt.submitted_at.unwrap_or_else(Utc::now);
            let section_statuses = json!({
                "listening": "auto_graded",
                "reading": "auto_graded",
                "writing": "needs_review",
                "speaking": "pending"
            });

            let submission = sqlx::query_as::<_, StudentSubmission>(
                r#"
                INSERT INTO student_submissions (
                    id, attempt_id, schedule_id, exam_id, published_version_id, student_id,
                    student_name, student_email, cohort_name, submitted_at, grading_status,
                    section_statuses, created_at, updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, 'submitted',
                    $11, $10, $10
                )
                ON CONFLICT (attempt_id)
                DO UPDATE SET
                    submitted_at = EXCLUDED.submitted_at,
                    student_name = EXCLUDED.student_name,
                    student_email = EXCLUDED.student_email,
                    cohort_name = EXCLUDED.cohort_name,
                    section_statuses = EXCLUDED.section_statuses,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(attempt.id)
            .bind(attempt.schedule_id)
            .bind(attempt.exam_id)
            .bind(attempt.published_version_id)
            .bind(attempt.candidate_id)
            .bind(attempt.candidate_name)
            .bind(attempt.candidate_email)
            .bind(attempt.cohort_name)
            .bind(submitted_at)
            .bind(&section_statuses)
            .fetch_one(&self.pool)
            .await?;

            self.ensure_section_submissions(&submission, &attempt.final_submission)
                .await?;
        }

        Ok(())
    }

    async fn ensure_section_submissions(
        &self,
        submission: &StudentSubmission,
        final_submission: &Value,
    ) -> Result<(), GradingError> {
        let answers = final_submission
            .get("answers")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let writing_answers = final_submission
            .get("writingAnswers")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let submitted_at = submission.submitted_at;

        for (section, payload, status) in [
            (
                "listening",
                json!({ "type": "listening", "answers": answers.clone() }),
                SectionGradingStatus::AutoGraded,
            ),
            (
                "reading",
                json!({ "type": "reading", "answers": answers.clone() }),
                SectionGradingStatus::AutoGraded,
            ),
            (
                "writing",
                json!({ "type": "writing", "tasks": writing_task_array(&writing_answers) }),
                SectionGradingStatus::NeedsReview,
            ),
            (
                "speaking",
                json!({ "type": "speaking", "responses": [] }),
                SectionGradingStatus::Pending,
            ),
        ] {
            let section_row = sqlx::query_as::<_, SectionSubmission>(
                r#"
                INSERT INTO section_submissions (
                    id, submission_id, section, answers, auto_grading_results, grading_status, submitted_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (submission_id, section)
                DO UPDATE SET answers = EXCLUDED.answers
                RETURNING *
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(submission.id)
            .bind(section)
            .bind(&payload)
            .bind(if matches!(status, SectionGradingStatus::AutoGraded) {
                Some(json!({ "generatedAt": submitted_at, "totalScore": 0, "maxScore": 0, "percentage": 0, "questionResults": [] }))
            } else {
                None
            })
            .bind(status)
            .bind(submitted_at)
            .fetch_one(&self.pool)
            .await?;

            if section == "writing" {
                let tasks = writing_task_entries(&writing_answers);
                for (task_id, value) in tasks {
                    sqlx::query(
                        r#"
                        INSERT INTO writing_task_submissions (
                            id, section_submission_id, submission_id, task_id, task_label, prompt,
                            student_text, word_count, annotations, grading_status, submitted_at
                        )
                        VALUES (
                            $1, $2, $3, $4, $5, '',
                            $6, $7, '[]'::jsonb, 'needs_review', $8
                        )
                        ON CONFLICT (section_submission_id, task_id)
                        DO UPDATE SET student_text = EXCLUDED.student_text, word_count = EXCLUDED.word_count
                        "#,
                    )
                    .bind(Uuid::new_v4())
                    .bind(section_row.id)
                    .bind(submission.id)
                    .bind(&task_id)
                    .bind(&task_id)
                    .bind(&value)
                    .bind(word_count(&value))
                    .bind(submitted_at)
                    .execute(&self.pool)
                    .await?;
                }
            }
        }

        Ok(())
    }

    async fn refresh_session_counters(&self) -> Result<(), GradingError> {
        let rows = sqlx::query_as::<_, SessionCounterRow>(
            r#"
            SELECT
                schedule_id,
                COUNT(*)::int AS total_students,
                COUNT(*)::int AS submitted_count,
                COUNT(*) FILTER (WHERE grading_status IN ('submitted', 'reopened'))::int AS pending_manual_reviews,
                COUNT(*) FILTER (WHERE grading_status = 'in_progress')::int AS in_progress_reviews,
                COUNT(*) FILTER (WHERE grading_status IN ('grading_complete', 'ready_to_release', 'released'))::int AS finalized_reviews,
                COUNT(*) FILTER (WHERE is_overdue)::int AS overdue_reviews
            FROM student_submissions
            GROUP BY schedule_id
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for row in rows {
            sqlx::query(
                r#"
                UPDATE grading_sessions
                SET
                    total_students = $2,
                    submitted_count = $3,
                    pending_manual_reviews = $4,
                    in_progress_reviews = $5,
                    finalized_reviews = $6,
                    overdue_reviews = $7,
                    updated_at = now()
                WHERE schedule_id = $1
                "#,
            )
            .bind(row.schedule_id)
            .bind(row.total_students)
            .bind(row.submitted_count)
            .bind(row.pending_manual_reviews)
            .bind(row.in_progress_reviews)
            .bind(row.finalized_reviews)
            .bind(row.overdue_reviews)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
}

#[derive(FromRow)]
struct ScheduleSeedRow {
    id: Uuid,
    exam_id: Uuid,
    exam_title: String,
    published_version_id: Uuid,
    cohort_name: String,
    institution: Option<String>,
    start_time: chrono::DateTime<Utc>,
    end_time: chrono::DateTime<Utc>,
    status: ScheduleStatus,
    created_at: chrono::DateTime<Utc>,
    created_by: String,
    updated_at: chrono::DateTime<Utc>,
}

#[derive(FromRow)]
struct AttemptSubmissionRow {
    id: Uuid,
    schedule_id: Uuid,
    exam_id: Uuid,
    published_version_id: Uuid,
    candidate_id: String,
    candidate_name: String,
    candidate_email: String,
    cohort_name: String,
    submitted_at: Option<chrono::DateTime<Utc>>,
    final_submission: Value,
}

#[derive(FromRow)]
struct SessionCounterRow {
    schedule_id: Uuid,
    total_students: i32,
    submitted_count: i32,
    pending_manual_reviews: i32,
    in_progress_reviews: i32,
    finalized_reviews: i32,
    overdue_reviews: i32,
}

fn map_schedule_status(status: ScheduleStatus) -> GradingSessionStatus {
    match status {
        ScheduleStatus::Scheduled => GradingSessionStatus::Scheduled,
        ScheduleStatus::Live => GradingSessionStatus::Live,
        ScheduleStatus::Completed => GradingSessionStatus::Completed,
        ScheduleStatus::Cancelled => GradingSessionStatus::Cancelled,
    }
}

fn writing_task_array(writing_answers: &Value) -> Value {
    Value::Array(
        writing_task_entries(writing_answers)
            .into_iter()
            .map(|(task_id, value)| {
                json!({
                    "taskId": task_id,
                    "text": value,
                    "wordCount": word_count(&value)
                })
            })
            .collect(),
    )
}

fn writing_task_entries(writing_answers: &Value) -> Vec<(String, String)> {
    writing_answers
        .as_object()
        .map(|items| {
            items
                .iter()
                .map(|(task_id, value)| {
                    (
                        task_id.clone(),
                        value.as_str().unwrap_or_default().to_owned(),
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn word_count(value: &str) -> i32 {
    value.split_whitespace().count() as i32
}

fn build_section_bands(section_drafts: &Value) -> Value {
    let mut section_bands = Map::new();
    for key in ["listening", "reading", "speaking"] {
        section_bands.insert(
            key.to_owned(),
            json!(extract_overall_band(section_drafts.get(key))),
        );
    }

    let writing_value = section_drafts
        .get("writing")
        .and_then(Value::as_object)
        .map(|writing| {
            let values = writing
                .values()
                .filter_map(|value| value.get("overallBand").and_then(Value::as_f64))
                .collect::<Vec<_>>();
            if values.is_empty() {
                0.0
            } else {
                values.iter().sum::<f64>() / values.len() as f64
            }
        })
        .unwrap_or(0.0);
    section_bands.insert("writing".to_owned(), json!(writing_value));

    Value::Object(section_bands)
}

fn extract_overall_band(value: Option<&Value>) -> f64 {
    value
        .and_then(|value| value.get("overallBand"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
}

fn average_band(section_bands: &Value) -> f64 {
    let values = section_bands
        .as_object()
        .map(|bands| {
            bands
                .values()
                .filter_map(Value::as_f64)
                .filter(|value| *value > 0.0)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}
