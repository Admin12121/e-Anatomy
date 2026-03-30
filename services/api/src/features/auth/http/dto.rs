use serde::{Deserialize, Serialize};

use crate::features::auth::domain::models::AuthenticatedSession;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub user: SessionUserResponse,
    pub account: SessionAccountResponse,
    pub session: SessionMetaResponse,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUserResponse {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAccountResponse {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub account_type: String,
    pub role_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetaResponse {
    pub expires_at: String,
}

impl From<AuthenticatedSession> for SessionResponse {
    fn from(value: AuthenticatedSession) -> Self {
        Self {
            user: SessionUserResponse {
                id: value.user_id,
                email: value.email,
                display_name: value.display_name,
                status: value.status,
            },
            account: SessionAccountResponse {
                id: value.account_id.to_string(),
                slug: value.account_slug,
                name: value.account_name,
                account_type: value.account_type,
                role_code: value.role_code,
            },
            session: SessionMetaResponse {
                expires_at: value.expires_at.to_rfc3339(),
            },
        }
    }
}
