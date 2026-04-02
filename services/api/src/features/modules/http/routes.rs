use axum::{
    Json, Router, extract::State, http::HeaderMap, http::StatusCode, response::IntoResponse,
    routing::get,
};
use axum_extra::extract::cookie::CookieJar;
use uuid::Uuid;

use crate::infrastructure::{error::AppError, state::AppState};

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

async fn resolve_account_id(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<Uuid, AppError> {
    if let Some(account_id) = get_trusted_account_id(state, headers)? {
        return Ok(account_id);
    }

    let session = state
        .auth_service
        .get_session_from_token(
            jar.get(&state.config.auth.cookie_name)
                .map(|cookie| cookie.value()),
        )
        .await?;

    Ok(session.account_id)
}

fn get_trusted_account_id(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<Uuid>, AppError> {
    let Some(provided_key) = headers
        .get("x-internal-api-key")
        .and_then(|value| value.to_str().ok())
    else {
        return Ok(None);
    };

    if provided_key != state.config.internal_web_api_key {
        return Err(AppError::unauthorized("Internal API key is invalid"));
    }

    let raw_account_id = headers
        .get("x-account-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::unauthorized("Trusted request missing x-account-id"))?;

    let account_id = Uuid::parse_str(raw_account_id)
        .map_err(|_| AppError::unauthorized("Trusted request account id is invalid"))?;

    Ok(Some(account_id))
}
