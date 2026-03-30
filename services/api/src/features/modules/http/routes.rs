use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use axum_extra::extract::cookie::CookieJar;

use crate::infrastructure::{error::AppError, state::AppState};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list_modules))
}

async fn list_modules(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    let session = state
        .auth_service
        .get_session_from_token(
            jar.get(&state.config.auth.cookie_name)
                .map(|cookie| cookie.value()),
        )
        .await?;

    let response = state
        .module_service
        .list_for_account(session.account_id)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}
