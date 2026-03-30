use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct UserRecord {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub display_name: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct LoginCommand {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone)]
pub struct SessionToken {
    pub raw: String,
    pub hash: String,
}

#[derive(Debug, Clone)]
pub struct LoginOutcome {
    pub session: AuthenticatedSession,
    pub cookie: SessionCookiePayload,
}

#[derive(Debug, Clone)]
pub struct SessionCookiePayload {
    pub name: String,
    pub value: String,
    pub ttl_hours: i64,
    pub secure: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthenticatedSession {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub status: String,
    pub account_id: Uuid,
    pub account_slug: String,
    pub account_name: String,
    pub account_type: String,
    pub role_code: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct AccountSnapshot {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub account_type: String,
    pub role_code: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct SessionLookupRecord {
    pub session_id: Uuid,
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub user_status: String,
    pub account_id: Uuid,
    pub account_slug: String,
    pub account_name: String,
    pub account_type: String,
    pub role_code: String,
    pub expires_at: DateTime<Utc>,
}
