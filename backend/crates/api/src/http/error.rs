use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::http::response::ResponseMetadata;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ErrorResponse {
    pub success: bool,
    pub error: ErrorPayload,
    pub metadata: ResponseMetadata,
}

impl ErrorResponse {
    pub fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        details: Vec<String>,
        request_id: impl Into<String>,
    ) -> Self {
        Self {
            success: false,
            error: ErrorPayload {
                code: code.into(),
                message: message.into(),
                details,
            },
            metadata: ResponseMetadata::new(request_id),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppError {
    status: StatusCode,
    body: ErrorResponse,
}

impl AppError {
    pub fn new(
        status: StatusCode,
        code: impl Into<String>,
        message: impl Into<String>,
        request_id: impl Into<String>,
    ) -> Self {
        Self {
            status,
            body: ErrorResponse::new(code, message, Vec::new(), request_id),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}
