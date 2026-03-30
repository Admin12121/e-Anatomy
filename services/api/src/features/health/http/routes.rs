use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use serde::Serialize;
use sqlx::Row;

use crate::infrastructure::{error::AppError, state::AppState};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/live", get(live))
        .route("/ready", get(ready))
}

async fn live() -> impl IntoResponse {
    (StatusCode::OK, Json(HealthResponse { status: "ok" }))
}

async fn ready(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    sqlx::query("SELECT 1")
        .fetch_one(&state.pool)
        .await?
        .try_get::<i32, _>(0)
        .map_err(|error| AppError::internal(error.to_string()))?;

    Ok((StatusCode::OK, Json(HealthResponse { status: "ok" })))
}
