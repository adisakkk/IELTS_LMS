use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

#[cfg(feature = "sqlx")]
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "sqlx", derive(FromRow))]
#[serde(rename_all = "camelCase")]
pub struct ExamEntity {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub exam_type: ExamType,
    pub status: ExamStatus,
    pub visibility: Visibility,
    pub organization_id: Option<String>,
    pub owner_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
    pub archived_at: Option<DateTime<Utc>>,
    pub current_draft_version_id: Option<Uuid>,
    pub current_published_version_id: Option<Uuid>,
    pub total_questions: Option<i32>,
    pub total_reading_questions: Option<i32>,
    pub total_listening_questions: Option<i32>,
    pub schema_version: i32,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "text")]
pub enum ExamType {
    #[serde(rename = "Academic")]
    #[sqlx(rename = "Academic")]
    Academic,
    #[serde(rename = "General Training")]
    #[sqlx(rename = "General Training")]
    GeneralTraining,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ExamStatus {
    Draft,
    InReview,
    Approved,
    Rejected,
    Scheduled,
    Published,
    Archived,
    Unpublished,
}

impl fmt::Display for ExamStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExamStatus::Draft => write!(f, "draft"),
            ExamStatus::InReview => write!(f, "in_review"),
            ExamStatus::Approved => write!(f, "approved"),
            ExamStatus::Rejected => write!(f, "rejected"),
            ExamStatus::Scheduled => write!(f, "scheduled"),
            ExamStatus::Published => write!(f, "published"),
            ExamStatus::Archived => write!(f, "archived"),
            ExamStatus::Unpublished => write!(f, "unpublished"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum Visibility {
    Private,
    Organization,
    Public,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "sqlx", derive(FromRow))]
#[serde(rename_all = "camelCase")]
pub struct ExamVersion {
    pub id: Uuid,
    pub exam_id: Uuid,
    pub version_number: i32,
    pub parent_version_id: Option<Uuid>,
    pub content_snapshot: serde_json::Value,
    pub config_snapshot: serde_json::Value,
    pub validation_snapshot: Option<serde_json::Value>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub publish_notes: Option<String>,
    pub is_draft: bool,
    pub is_published: bool,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "sqlx", derive(FromRow))]
#[serde(rename_all = "camelCase")]
pub struct ExamEvent {
    pub id: Uuid,
    pub exam_id: Uuid,
    pub version_id: Option<Uuid>,
    pub actor_id: String,
    pub action: ExamEventAction,
    pub from_state: Option<String>,
    pub to_state: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ExamEventAction {
    Created,
    DraftSaved,
    SubmittedForReview,
    Approved,
    Rejected,
    Published,
    Unpublished,
    Scheduled,
    Archived,
    Restored,
    Cloned,
    VersionCreated,
    VersionRestored,
    PermissionsUpdated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "sqlx", derive(FromRow))]
#[serde(rename_all = "camelCase")]
pub struct ExamMembership {
    pub id: Uuid,
    pub exam_id: Uuid,
    pub actor_id: String,
    pub role: MembershipRole,
    pub granted_by: String,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum MembershipRole {
    Owner,
    Reviewer,
    Grader,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExamRequest {
    pub slug: String,
    pub title: String,
    pub exam_type: ExamType,
    pub visibility: Visibility,
    pub organization_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExamRequest {
    pub title: Option<String>,
    pub status: Option<ExamStatus>,
    pub visibility: Option<Visibility>,
    pub organization_id: Option<String>,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftRequest {
    pub content_snapshot: serde_json::Value,
    pub config_snapshot: serde_json::Value,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishExamRequest {
    pub publish_notes: Option<String>,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneExamRequest {
    pub new_slug: String,
    pub new_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamValidationSummary {
    pub exam_id: Uuid,
    pub draft_version_id: Option<Uuid>,
    pub can_publish: bool,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
    pub validated_at: DateTime<Utc>,
}
