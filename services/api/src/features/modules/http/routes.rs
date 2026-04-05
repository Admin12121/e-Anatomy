use axum::{
    Json, Router, extract::State, http::HeaderMap, http::StatusCode, response::IntoResponse,
    routing::get,
};
use axum_extra::extract::cookie::CookieJar;

use crate::infrastructure::{error::AppError, http::resolve_account_id, state::AppState};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list_modules))
}

async fn list_modules(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .module_service
        .list_for_account(resolve_account_id(&state, &jar, &headers).await?)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}
