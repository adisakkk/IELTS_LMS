use chrono::Utc;
use ielts_backend_domain::exam::{
    CreateExamRequest, ExamEntity, ExamEvent, ExamEventAction, ExamStatus, ExamValidationSummary,
    ExamVersion, PublishExamRequest, SaveDraftRequest, UpdateExamRequest, ValidationIssue,
};
use ielts_backend_infrastructure::actor_context::ActorContext;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum BuilderError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct BuilderService {
    pool: PgPool,
}

impl BuilderService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_exam(
        &self,
        ctx: &ActorContext,
        req: CreateExamRequest,
    ) -> Result<ExamEntity, BuilderError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        let exam = sqlx::query_as::<_, ExamEntity>(
            r#"
            INSERT INTO exam_entities (
                id, slug, title, exam_type, status, visibility, 
                organization_id, owner_id, created_at, updated_at, 
                schema_version, revision
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&req.slug)
        .bind(&req.title)
        .bind(req.exam_type)
        .bind(ExamStatus::Draft)
        .bind(req.visibility)
        .bind(&req.organization_id)
        .bind(ctx.actor_id.to_string())
        .bind(now)
        .bind(now)
        .bind(1)
        .bind(0)
        .fetch_one(&self.pool)
        .await?;

        // Record creation event
        self.record_event(
            &exam.id,
            None,
            ctx,
            ExamEventAction::Created,
            None,
            Some(ExamStatus::Draft.to_string()),
            None,
        )
        .await?;

        Ok(exam)
    }

    pub async fn list_exams(&self, _ctx: &ActorContext) -> Result<Vec<ExamEntity>, BuilderError> {
        sqlx::query_as::<_, ExamEntity>(
            "SELECT * FROM exam_entities ORDER BY updated_at DESC, created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(BuilderError::from)
    }

    pub async fn get_exam(
        &self,
        _ctx: &ActorContext,
        id: Uuid,
    ) -> Result<ExamEntity, BuilderError> {
        sqlx::query_as::<_, ExamEntity>("SELECT * FROM exam_entities WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(BuilderError::NotFound)
    }

    pub async fn update_exam(
        &self,
        ctx: &ActorContext,
        id: Uuid,
        req: UpdateExamRequest,
    ) -> Result<ExamEntity, BuilderError> {
        let existing = self.get_exam(ctx, id).await?;

        if existing.revision != req.revision {
            return Err(BuilderError::Conflict(
                "Exam has been modified by another user".to_string(),
            ));
        }

        let updated_at = Utc::now();

        let exam = sqlx::query_as::<_, ExamEntity>(
            r#"
            UPDATE exam_entities
            SET 
                title = COALESCE($2, title),
                status = COALESCE($3, status),
                visibility = COALESCE($4, visibility),
                organization_id = COALESCE($5, organization_id),
                updated_at = $6,
                revision = revision + 1
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&req.title)
        .bind(req.status)
        .bind(req.visibility)
        .bind(&req.organization_id)
        .bind(updated_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(exam)
    }

    pub async fn save_draft(
        &self,
        ctx: &ActorContext,
        exam_id: Uuid,
        req: SaveDraftRequest,
    ) -> Result<ExamVersion, BuilderError> {
        let mut tx = self.pool.begin().await?;

        // Verify exam exists and check revision
        let exam: ExamEntity =
            sqlx::query_as("SELECT * FROM exam_entities WHERE id = $1 FOR UPDATE")
                .bind(exam_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(BuilderError::NotFound)?;

        if exam.revision != req.revision {
            return Err(BuilderError::Conflict(
                "Draft has been modified by another user".to_string(),
            ));
        }

        // Get next version number
        let version_number: i32 = sqlx::query_scalar("SELECT get_next_exam_version_number($1)")
            .bind(exam_id)
            .fetch_one(&mut *tx)
            .await?;

        // Create new draft version
        let version_id = Uuid::new_v4();
        let now = Utc::now();

        let version = sqlx::query_as::<_, ExamVersion>(
            r#"
            INSERT INTO exam_versions (
                id, exam_id, version_number, content_snapshot, config_snapshot,
                created_by, created_at, is_draft, is_published, revision
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            "#,
        )
        .bind(version_id)
        .bind(exam_id)
        .bind(version_number)
        .bind(&req.content_snapshot)
        .bind(&req.config_snapshot)
        .bind(ctx.actor_id.to_string())
        .bind(now)
        .bind(true)
        .bind(false)
        .bind(0)
        .fetch_one(&mut *tx)
        .await?;

        // Update exam's current draft version pointer and increment revision
        sqlx::query(
            r#"
            UPDATE exam_entities
            SET 
                current_draft_version_id = $1,
                updated_at = $2,
                revision = revision + 1
            WHERE id = $3
            "#,
        )
        .bind(version_id)
        .bind(now)
        .bind(exam_id)
        .execute(&mut *tx)
        .await?;

        // Record draft saved event
        sqlx::query(
            r#"
            INSERT INTO exam_events (id, exam_id, version_id, actor_id, action, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(exam_id)
        .bind(version_id)
        .bind(ctx.actor_id.to_string())
        .bind(ExamEventAction::DraftSaved)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(version)
    }

    #[tracing::instrument(
        skip(self, ctx, req),
        fields(actor_id = %ctx.actor_id, exam_id = %exam_id)
    )]
    pub async fn publish_exam(
        &self,
        ctx: &ActorContext,
        exam_id: Uuid,
        req: PublishExamRequest,
    ) -> Result<ExamVersion, BuilderError> {
        let mut tx = self.pool.begin().await?;

        // Verify exam exists and check revision
        let exam: ExamEntity =
            sqlx::query_as("SELECT * FROM exam_entities WHERE id = $1 FOR UPDATE")
                .bind(exam_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(BuilderError::NotFound)?;

        if exam.revision != req.revision {
            return Err(BuilderError::Conflict(
                "Exam has been modified by another user".to_string(),
            ));
        }

        if exam.current_draft_version_id.is_none() {
            return Err(BuilderError::Validation(
                "Cannot publish exam without a draft version".to_string(),
            ));
        }

        let draft_version_id = exam.current_draft_version_id.unwrap();

        // Update the draft version to published
        let now = Utc::now();

        let version = sqlx::query_as::<_, ExamVersion>(
            r#"
            UPDATE exam_versions
            SET 
                is_draft = false,
                is_published = true,
                publish_notes = $1,
                created_at = $2,
                revision = revision + 1
            WHERE id = $3
            RETURNING *
            "#,
        )
        .bind(&req.publish_notes)
        .bind(now)
        .bind(draft_version_id)
        .fetch_one(&mut *tx)
        .await?;

        // Update exam entity
        sqlx::query(
            r#"
            UPDATE exam_entities
            SET 
                current_draft_version_id = NULL,
                current_published_version_id = $1,
                status = $2,
                published_at = $3,
                updated_at = $4,
                revision = revision + 1
            WHERE id = $5
            "#,
        )
        .bind(draft_version_id)
        .bind(ExamStatus::Published)
        .bind(now)
        .bind(now)
        .bind(exam_id)
        .execute(&mut *tx)
        .await?;

        // Record publish event
        sqlx::query(
            r#"
            INSERT INTO exam_events (id, exam_id, version_id, actor_id, action, from_state, to_state, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(exam_id)
        .bind(draft_version_id)
        .bind(ctx.actor_id.to_string())
        .bind(ExamEventAction::Published)
        .bind(ExamStatus::Draft.to_string())
        .bind(ExamStatus::Published.to_string())
        .bind(now)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(version)
    }

    pub async fn get_version(
        &self,
        _ctx: &ActorContext,
        version_id: Uuid,
    ) -> Result<ExamVersion, BuilderError> {
        sqlx::query_as::<_, ExamVersion>("SELECT * FROM exam_versions WHERE id = $1")
            .bind(version_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(BuilderError::NotFound)
    }

    pub async fn list_versions(
        &self,
        _ctx: &ActorContext,
        exam_id: Uuid,
    ) -> Result<Vec<ExamVersion>, BuilderError> {
        sqlx::query_as::<_, ExamVersion>(
            "SELECT * FROM exam_versions WHERE exam_id = $1 ORDER BY created_at DESC",
        )
        .bind(exam_id)
        .fetch_all(&self.pool)
        .await
        .map_err(BuilderError::from)
    }

    pub async fn list_events(
        &self,
        _ctx: &ActorContext,
        exam_id: Uuid,
    ) -> Result<Vec<ExamEvent>, BuilderError> {
        sqlx::query_as::<_, ExamEvent>(
            "SELECT * FROM exam_events WHERE exam_id = $1 ORDER BY created_at DESC",
        )
        .bind(exam_id)
        .fetch_all(&self.pool)
        .await
        .map_err(BuilderError::from)
    }

    pub async fn delete_exam(
        &self,
        _ctx: &ActorContext,
        exam_id: Uuid,
    ) -> Result<(), BuilderError> {
        let deleted = sqlx::query("DELETE FROM exam_entities WHERE id = $1")
            .bind(exam_id)
            .execute(&self.pool)
            .await?;

        if deleted.rows_affected() == 0 {
            return Err(BuilderError::NotFound);
        }

        Ok(())
    }

    #[tracing::instrument(skip(self, ctx), fields(actor_id = %ctx.actor_id, exam_id = %exam_id))]
    pub async fn validate_exam(
        &self,
        ctx: &ActorContext,
        exam_id: Uuid,
    ) -> Result<ExamValidationSummary, BuilderError> {
        let exam = self.get_exam(ctx, exam_id).await?;
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        if exam.title.trim().is_empty() {
            errors.push(ValidationIssue {
                field: "title".to_owned(),
                message: "Exam title is required.".to_owned(),
            });
        }

        let draft_version = if let Some(draft_version_id) = exam.current_draft_version_id {
            let version = self.get_version(ctx, draft_version_id).await?;

            if version.content_snapshot.is_null()
                || version
                    .content_snapshot
                    .as_object()
                    .is_some_and(|value| value.is_empty())
            {
                warnings.push(ValidationIssue {
                    field: "contentSnapshot".to_owned(),
                    message: "Draft content is empty and should be reviewed before publishing."
                        .to_owned(),
                });
            }

            if version.config_snapshot.is_null()
                || version
                    .config_snapshot
                    .as_object()
                    .is_some_and(|value| value.is_empty())
            {
                warnings.push(ValidationIssue {
                    field: "configSnapshot".to_owned(),
                    message:
                        "Draft configuration is empty and should be reviewed before publishing."
                            .to_owned(),
                });
            }

            Some(version)
        } else {
            errors.push(ValidationIssue {
                field: "draftVersion".to_owned(),
                message: "Create and save a draft version before publishing.".to_owned(),
            });
            None
        };

        Ok(ExamValidationSummary {
            exam_id: exam.id,
            draft_version_id: draft_version.as_ref().map(|version| version.id),
            can_publish: errors.is_empty(),
            errors,
            warnings,
            validated_at: Utc::now(),
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn record_event(
        &self,
        exam_id: &Uuid,
        version_id: Option<Uuid>,
        ctx: &ActorContext,
        action: ExamEventAction,
        from_state: Option<String>,
        to_state: Option<String>,
        payload: Option<serde_json::Value>,
    ) -> Result<(), BuilderError> {
        sqlx::query(
            r#"
            INSERT INTO exam_events (id, exam_id, version_id, actor_id, action, from_state, to_state, payload, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(exam_id)
        .bind(version_id)
        .bind(ctx.actor_id.to_string())
        .bind(action)
        .bind(&from_state)
        .bind(&to_state)
        .bind(&payload)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
