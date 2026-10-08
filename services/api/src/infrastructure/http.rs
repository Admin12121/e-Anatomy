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
    _jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<Uuid, AppError> {
    if let Some(context) = get_trusted_actor_context(state, headers).await? {
        return Ok(context.account_id);
    }

    Err(AppError::unauthorized(
        "Trusted internal request is required",
    ))
}

pub async fn resolve_admin_account_id(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<Uuid, AppError> {
    Ok(resolve_admin_actor_context(state, jar, headers)
        .await?
        .account_id)
}

#[allow(dead_code)]
pub async fn resolve_actor_context(
    state: &AppState,
    _jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<RequestActorContext, AppError> {
    if let Some(context) = get_trusted_actor_context(state, headers).await? {
        return Ok(context);
    }

    Err(AppError::unauthorized(
        "Trusted internal request is required",
    ))
}

pub async fn resolve_admin_actor_context(
    state: &AppState,
    _jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<RequestActorContext, AppError> {
    if let Some(context) = get_trusted_actor_context(state, headers).await? {
        return Ok(context);
    }

    Err(AppError::unauthorized(
        "Trusted internal request is required",
    ))
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
    let role_code = resolve_trusted_actor_role(&state.pool, account_id, user_id).await?;

    if !has_admin_access(&role_code) {
        return Err(AppError::unauthorized(
            "You do not have access to the admin playground",
        ));
    }

    Ok(Some(RequestActorContext {
        account_id,
        user_id: user_id.to_string(),
    }))
}

async fn resolve_trusted_actor_role(
    pool: &PgPool,
    account_id: Uuid,
    user_id: &str,
) -> Result<String, AppError> {
    let role_code = sqlx::query_scalar::<_, String>(
        r#"
        SELECT account_memberships.role_code
        FROM account_memberships
        INNER JOIN accounts ON accounts.id = account_memberships.account_id
        INNER JOIN "user" AS auth_user ON auth_user.id = account_memberships.user_id
        WHERE auth_user.id = $1
          AND auth_user.status = 'active'
          AND account_memberships.account_id = $2
          AND account_memberships.status = 'active'
          AND accounts.status = 'active'
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(account_id)
    .fetch_optional(pool)
    .await?;

    role_code.ok_or_else(|| AppError::unauthorized("Trusted request user id is invalid"))
}

fn has_admin_access(role_code: &str) -> bool {
    matches!(
        role_code.trim(),
        "owner" | "admin" | "platform_admin" | "content_admin" | "editor" | "reviewer"
    )
}

pub async fn require_content_editor(
    state: &AppState,
    account: Uuid,
    user: &str,
) -> Result<(), AppError> {
    let allowed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM account_memberships WHERE account_id=$1 AND user_id=$2 AND status='active' AND role_code IN ('owner','admin','platform_admin','content_admin','editor'))")
        .bind(account).bind(user).fetch_one(&state.pool).await?;
    if !allowed {
        return Err(AppError::unauthorized("Content editing is not permitted"));
    }
    Ok(())
}
