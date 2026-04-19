use chrono::Utc;
use ielts_backend_domain::library::{
    AdminDefaultProfile, CreatePassageRequest, CreateQuestionRequest, Difficulty,
    PassageLibraryItem, QuestionBankItem, UpdateExamDefaultsRequest, UpdatePassageRequest,
    UpdateQuestionRequest,
};
use ielts_backend_infrastructure::actor_context::ActorContext;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum LibraryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct LibraryService {
    pool: PgPool,
}

impl LibraryService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // Passage Library

    pub async fn create_passage(
        &self,
        ctx: &ActorContext,
        req: CreatePassageRequest,
    ) -> Result<PassageLibraryItem, LibraryError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        let passage = sqlx::query_as::<_, PassageLibraryItem>(
            r#"
            INSERT INTO passage_library_items (
                id, organization_id, title, passage_snapshot, difficulty, topic,
                tags, word_count, estimated_time_minutes, usage_count,
                created_by, created_at, updated_at, revision
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(ctx.organization_id.as_ref().map(|id| id.to_string()))
        .bind(&req.title)
        .bind(&req.passage_snapshot)
        .bind(req.difficulty)
        .bind(&req.topic)
        .bind(&req.tags)
        .bind(req.word_count)
        .bind(req.estimated_time_minutes)
        .bind(0)
        .bind(ctx.actor_id.to_string())
        .bind(now)
        .bind(now)
        .bind(0)
        .fetch_one(&self.pool)
        .await?;

        Ok(passage)
    }

    pub async fn get_passage(
        &self,
        _ctx: &ActorContext,
        id: Uuid,
    ) -> Result<PassageLibraryItem, LibraryError> {
        sqlx::query_as::<_, PassageLibraryItem>("SELECT * FROM passage_library_items WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(LibraryError::NotFound)
    }

    pub async fn update_passage(
        &self,
        ctx: &ActorContext,
        id: Uuid,
        req: UpdatePassageRequest,
    ) -> Result<PassageLibraryItem, LibraryError> {
        let existing = self.get_passage(ctx, id).await?;

        if existing.revision != req.revision {
            return Err(LibraryError::Conflict(
                "Passage has been modified by another user".to_string(),
            ));
        }

        let updated_at = Utc::now();

        let passage = sqlx::query_as::<_, PassageLibraryItem>(
            r#"
            UPDATE passage_library_items
            SET 
                title = COALESCE($2, title),
                passage_snapshot = COALESCE($3, passage_snapshot),
                difficulty = COALESCE($4, difficulty),
                topic = COALESCE($5, topic),
                tags = COALESCE($6, tags),
                word_count = COALESCE($7, word_count),
                estimated_time_minutes = COALESCE($8, estimated_time_minutes),
                updated_at = $9,
                revision = revision + 1
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&req.title)
        .bind(&req.passage_snapshot)
        .bind(&req.difficulty)
        .bind(&req.topic)
        .bind(&req.tags)
        .bind(req.word_count)
        .bind(req.estimated_time_minutes)
        .bind(updated_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(passage)
    }

    pub async fn delete_passage(&self, _ctx: &ActorContext, id: Uuid) -> Result<(), LibraryError> {
        let result = sqlx::query("DELETE FROM passage_library_items WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(LibraryError::NotFound);
        }

        Ok(())
    }

    pub async fn list_passages(
        &self,
        ctx: &ActorContext,
        difficulty: Option<Difficulty>,
        topic: Option<String>,
        limit: i64,
    ) -> Result<Vec<PassageLibraryItem>, LibraryError> {
        let mut query = String::from(
            "SELECT * FROM passage_library_items WHERE organization_id IS NOT DISTINCT FROM $1",
        );
        let mut param_count = 1;

        if difficulty.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND difficulty = ${}", param_count));
        }

        if topic.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND topic = ${}", param_count));
        }

        query.push_str(" ORDER BY updated_at DESC LIMIT ");
        param_count += 1;
        query.push_str(&format!("{}", param_count));

        let org_id = ctx.organization_id.as_ref().map(|id| id.to_string());
        let mut q = sqlx::query_as::<_, PassageLibraryItem>(&query).bind(org_id);

        if let Some(diff) = difficulty {
            q = q.bind(diff);
        }

        if let Some(t) = topic {
            q = q.bind(t);
        }

        q = q.bind(limit);

        q.fetch_all(&self.pool).await.map_err(LibraryError::from)
    }

    // Question Bank

    pub async fn create_question(
        &self,
        ctx: &ActorContext,
        req: CreateQuestionRequest,
    ) -> Result<QuestionBankItem, LibraryError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        let question = sqlx::query_as::<_, QuestionBankItem>(
            r#"
            INSERT INTO question_bank_items (
                id, organization_id, question_type, block_snapshot, difficulty, topic,
                tags, usage_count, created_by, created_at, updated_at, revision
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(ctx.organization_id.as_ref().map(|id| id.to_string()))
        .bind(&req.question_type)
        .bind(&req.block_snapshot)
        .bind(req.difficulty)
        .bind(&req.topic)
        .bind(&req.tags)
        .bind(0)
        .bind(ctx.actor_id.to_string())
        .bind(now)
        .bind(now)
        .bind(0)
        .fetch_one(&self.pool)
        .await?;

        Ok(question)
    }

    pub async fn get_question(
        &self,
        _ctx: &ActorContext,
        id: Uuid,
    ) -> Result<QuestionBankItem, LibraryError> {
        sqlx::query_as::<_, QuestionBankItem>("SELECT * FROM question_bank_items WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(LibraryError::NotFound)
    }

    pub async fn update_question(
        &self,
        ctx: &ActorContext,
        id: Uuid,
        req: UpdateQuestionRequest,
    ) -> Result<QuestionBankItem, LibraryError> {
        let existing = self.get_question(ctx, id).await?;

        if existing.revision != req.revision {
            return Err(LibraryError::Conflict(
                "Question has been modified by another user".to_string(),
            ));
        }

        let updated_at = Utc::now();

        let question = sqlx::query_as::<_, QuestionBankItem>(
            r#"
            UPDATE question_bank_items
            SET 
                question_type = COALESCE($2, question_type),
                block_snapshot = COALESCE($3, block_snapshot),
                difficulty = COALESCE($4, difficulty),
                topic = COALESCE($5, topic),
                tags = COALESCE($6, tags),
                updated_at = $7,
                revision = revision + 1
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&req.question_type)
        .bind(&req.block_snapshot)
        .bind(&req.difficulty)
        .bind(&req.topic)
        .bind(&req.tags)
        .bind(updated_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(question)
    }

    pub async fn delete_question(&self, _ctx: &ActorContext, id: Uuid) -> Result<(), LibraryError> {
        let result = sqlx::query("DELETE FROM question_bank_items WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(LibraryError::NotFound);
        }

        Ok(())
    }

    pub async fn list_questions(
        &self,
        ctx: &ActorContext,
        question_type: Option<String>,
        difficulty: Option<Difficulty>,
        topic: Option<String>,
        limit: i64,
    ) -> Result<Vec<QuestionBankItem>, LibraryError> {
        let mut query = String::from(
            "SELECT * FROM question_bank_items WHERE organization_id IS NOT DISTINCT FROM $1",
        );
        let mut param_count = 1;

        if question_type.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND question_type = ${}", param_count));
        }

        if difficulty.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND difficulty = ${}", param_count));
        }

        if topic.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND topic = ${}", param_count));
        }

        query.push_str(" ORDER BY updated_at DESC LIMIT ");
        param_count += 1;
        query.push_str(&format!("{}", param_count));

        let org_id = ctx.organization_id.as_ref().map(|id| id.to_string());
        let mut q = sqlx::query_as::<_, QuestionBankItem>(&query).bind(&org_id);

        if let Some(qt) = question_type {
            q = q.bind(qt);
        }

        if let Some(diff) = difficulty {
            q = q.bind(diff);
        }

        if let Some(t) = topic {
            q = q.bind(t);
        }

        q = q.bind(limit);

        q.fetch_all(&self.pool).await.map_err(LibraryError::from)
    }

    // Admin Default Profiles

    pub async fn get_exam_defaults(
        &self,
        _ctx: &ActorContext,
    ) -> Result<AdminDefaultProfile, LibraryError> {
        sqlx::query_as::<_, AdminDefaultProfile>(
            "SELECT * FROM admin_default_profiles WHERE is_active = true LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(LibraryError::NotFound)
    }

    pub async fn update_exam_defaults(
        &self,
        ctx: &ActorContext,
        req: UpdateExamDefaultsRequest,
    ) -> Result<AdminDefaultProfile, LibraryError> {
        let existing = self.get_exam_defaults(ctx).await?;

        if existing.revision != req.revision {
            return Err(LibraryError::Conflict(
                "Defaults have been modified by another user".to_string(),
            ));
        }

        let now = Utc::now();

        let profile = sqlx::query_as::<_, AdminDefaultProfile>(
            r#"
            UPDATE admin_default_profiles
            SET 
                config_snapshot = $1,
                updated_at = $2,
                revision = revision + 1
            WHERE id = $3
            RETURNING *
            "#,
        )
        .bind(&req.config_snapshot)
        .bind(now)
        .bind(existing.id)
        .fetch_one(&self.pool)
        .await?;

        Ok(profile)
    }
}
