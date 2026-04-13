use axum::http::HeaderMap;
use axum_extra::extract::cookie::CookieJar;
use sqlx::PgPool;
use uuid::Uuid;

use crate::infrastructure::{error::AppError, state::AppState};

#[derive(Debug, Clone)]
pub struct RequestActorContext {
    pub account_id: Uuid,
    pub user_id: String,
}

pub async fn resolve_account_id(
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

pub async fn resolve_admin_account_id(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<Uuid, AppError> {
    Ok(resolve_admin_actor_context(state, jar, headers).await?.account_id)
}

#[allow(dead_code)]
pub async fn resolve_actor_context(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<RequestActorContext, AppError> {
    if let Some(context) = get_trusted_actor_context(state, headers).await? {
        return Ok(context);
    }

    let session = state
        .auth_service
        .get_session_from_token(
            jar.get(&state.config.auth.cookie_name)
                .map(|cookie| cookie.value()),
        )
        .await?;

    Ok(RequestActorContext {
        account_id: session.account_id,
        user_id: session.user_id,
    })
}

pub async fn resolve_admin_actor_context(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<RequestActorContext, AppError> {
    if let Some(context) = get_trusted_actor_context(state, headers).await? {
        return Ok(context);
    }

    let session = state
        .auth_service
        .get_session_from_token(
            jar.get(&state.config.auth.cookie_name)
                .map(|cookie| cookie.value()),
        )
        .await?;

    if !has_admin_access(&session.role_code) {
        return Err(AppError::unauthorized(
            "You do not have access to the admin playground",
        ));
    }

    Ok(RequestActorContext {
        account_id: session.account_id,
        user_id: session.user_id,
    })
}

fn get_trusted_account_id(state: &AppState, headers: &HeaderMap) -> Result<Option<Uuid>, AppError> {
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

async fn get_trusted_actor_context(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<RequestActorContext>, AppError> {
    let Some(account_id) = get_trusted_account_id(state, headers)? else {
        return Ok(None);
    };

    let user_id = headers
        .get("x-user-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::unauthorized("Trusted request missing x-user-id"))?;
    let legacy_user_id = resolve_trusted_user_id(&state.pool, user_id).await?;

    Ok(Some(RequestActorContext {
        account_id,
        user_id: legacy_user_id,
    }))
}

async fn resolve_trusted_user_id(pool: &PgPool, provided_user_id: &str) -> Result<String, AppError> {
    if let Some(existing_legacy_user_id) = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE id = $1 LIMIT 1",
    )
    .bind(provided_user_id)
    .fetch_optional(pool)
    .await?
    {
        return Ok(existing_legacy_user_id);
    }

    let mapped_legacy_user_id = sqlx::query_scalar::<_, String>(
        r#"
        SELECT legacy.id
        FROM "user" AS auth_user
        INNER JOIN users AS legacy ON LOWER(legacy.email) = LOWER(auth_user.email)
        WHERE auth_user.id = $1
        LIMIT 1
        "#,
    )
    .bind(provided_user_id)
    .fetch_optional(pool)
    .await?;

    mapped_legacy_user_id
        .ok_or_else(|| AppError::unauthorized("Trusted request user id is invalid"))
}

fn has_admin_access(role_code: &str) -> bool {
    matches!(
        role_code.trim(),
        "owner" | "admin" | "platform_admin" | "content_admin" | "editor" | "reviewer"
    )
}
