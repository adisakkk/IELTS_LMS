use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMetadata {
    pub request_id: String,
    pub timestamp: String,
}

impl ResponseMetadata {
    pub fn new(request_id: impl Into<String>) -> Self {
        Self {
            request_id: request_id.into(),
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SuccessResponse<T> {
    pub success: bool,
    pub data: T,
    pub metadata: ResponseMetadata,
}

impl<T> SuccessResponse<T> {
    pub fn new(data: T, request_id: impl Into<String>) -> Self {
        Self {
            success: true,
            data,
            metadata: ResponseMetadata::new(request_id),
        }
    }
}

pub fn json<T>(data: T, request_id: impl Into<String>) -> Json<SuccessResponse<T>>
where
    T: Serialize,
{
    Json(SuccessResponse::new(data, request_id))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: T,
    pub metadata: ResponseMetadata,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self::success_with_request_id(data, "")
    }

    pub fn success_with_request_id(data: T, request_id: impl Into<String>) -> Self {
        Self {
            success: true,
            data,
            metadata: ResponseMetadata::new(request_id),
        }
    }
}

impl<T> IntoResponse for ApiResponse<T>
where
    T: Serialize,
{
    fn into_response(self) -> Response {
        Json(self).into_response()
    }
}

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &str, message: &str) -> Self {
        Self {
            status,
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}

impl From<ApiError> for StatusCode {
    fn from(err: ApiError) -> Self {
        err.status
    }
}

impl From<ApiError> for Response<axum::body::Body> {
    fn from(err: ApiError) -> Self {
        let body = Json(serde_json::json!({
            "success": false,
            "error": {
                "code": err.code,
                "message": err.message,
            },
            "metadata": {
                "requestId": "",
                "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            }
        }));
        (err.status, body).into_response()
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        Response::from(self)
    }
}
