use axum::{
    extract::{Extension, State},
    Json,
};
use ielts_backend_application::library::LibraryService;
use ielts_backend_domain::auth::UserRole;
use ielts_backend_domain::library::{AdminDefaultProfile, UpdateExamDefaultsRequest};

use crate::{
    http::{
        auth::{AuthenticatedUser, VerifiedCsrf},
        request_id::RequestId,
        response::{ApiError, ApiResponse},
    },
    state::AppState,
};

pub async fn get_exam_defaults(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
) -> Result<ApiResponse<AdminDefaultProfile>, ApiError> {
    principal.require_one_of(&[UserRole::Admin, UserRole::Builder])?;
    let ctx = principal.actor_context();
    let service = LibraryService::new(state.db_pool());
    let defaults = service.get_exam_defaults(&ctx).await?;
    Ok(ApiResponse::success_with_request_id(defaults, request_id.0))
}

pub async fn update_exam_defaults(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    _csrf: VerifiedCsrf,
    Json(req): Json<UpdateExamDefaultsRequest>,
) -> Result<ApiResponse<AdminDefaultProfile>, ApiError> {
    principal.require_one_of(&[UserRole::Admin, UserRole::Builder])?;
    let ctx = principal.actor_context();
    let service = LibraryService::new(state.db_pool());
    let defaults = service.update_exam_defaults(&ctx, req).await?;
    Ok(ApiResponse::success_with_request_id(defaults, request_id.0))
}
