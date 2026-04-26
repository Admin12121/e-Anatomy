use anyhow::Result;
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tracing::warn;
use uuid::Uuid;

use crate::features::auth::domain::models::{
    AuthenticatedSession, LoginCommand, LoginOutcome, SessionCookiePayload, SessionToken,
    UserRecord,
};
use crate::features::auth::infrastructure::repository::{AuthRepository, BootstrapAdminRecord};
use crate::infrastructure::{config::AuthConfig, error::AppError};

#[derive(Clone)]
pub struct AuthService {
    pool: PgPool,
    repo: AuthRepository,
    config: AuthConfig,
}

impl AuthService {
    pub fn new(pool: PgPool, config: AuthConfig) -> Self {
        Self {
            pool,
            repo: AuthRepository,
            config,
        }
    }

    pub async fn ensure_bootstrap_admin(&self) -> Result<()> {
        let email = normalize_email(&self.config.bootstrap_admin_email);
        let display_name = self.config.bootstrap_admin_name.trim();

        if display_name.is_empty() {
            anyhow::bail!("BOOTSTRAP_ADMIN_NAME must not be empty");
        }

        let password_hash = hash_password(&self.config.bootstrap_admin_password)?;
        let user_id = self
            .repo
            .upsert_bootstrap_user(
                &self.pool,
                &BootstrapAdminRecord {
                    user_id: Uuid::new_v4().to_string(),
                    email: email.clone(),
                    display_name: display_name.to_string(),
                    password_hash,
                },
            )
            .await?;

        let account = self
            .repo
            .ensure_personal_account(
                &self.pool,
                &user_id,
                "platform-admin",
                "Platform Administration",
            )
            .await?;

        self.repo
            .ensure_membership(&self.pool, account.id, &user_id, "owner")
            .await?;

        Ok(())
    }

    pub async fn login(&self, command: LoginCommand) -> Result<LoginOutcome, AppError> {
        let email = normalize_email(&command.email);
        let user = self
            .repo
            .find_user_by_email(&self.pool, &email)
            .await?
            .ok_or_else(|| AppError::unauthorized("Invalid email or password"))?;

        verify_password(&user, &command.password)?;

        let account = self
            .repo
            .find_primary_account_for_user(&self.pool, &user.id)
            .await?
            .ok_or_else(|| AppError::unauthorized("No active account is linked to this user"))?;

        let session_token = SessionToken::generate();
        let expires_at = Utc::now() + Duration::hours(self.config.session_ttl_hours);

        self.repo
            .create_session(
                &self.pool,
                &user.id,
                account.id,
                &session_token.hash,
                expires_at,
            )
            .await?;

        self.repo.touch_last_login(&self.pool, &user.id).await?;

        Ok(LoginOutcome {
            session: AuthenticatedSession {
                user_id: user.id,
                email: user.email,
                display_name: user.display_name,
                status: user.status,
                account_id: account.id,
                account_slug: account.slug,
                account_name: account.name,
                account_type: account.account_type,
                role_code: account.role_code,
                expires_at,
            },
            cookie: SessionCookiePayload {
                name: self.config.cookie_name.clone(),
                value: session_token.raw,
                ttl_hours: self.config.session_ttl_hours,
                secure: self.config.cookie_secure,
            },
        })
    }

    pub async fn get_session_from_token(
        &self,
        raw_token: Option<&str>,
    ) -> Result<AuthenticatedSession, AppError> {
        let Some(raw_token) = raw_token else {
            return Err(AppError::unauthorized("You are not signed in"));
        };

        let token_hash = hash_session_token(raw_token);
        let session = self
            .repo
            .find_session_by_hash(&self.pool, &token_hash)
            .await?
            .ok_or_else(|| AppError::unauthorized("Your session is no longer valid"))?;

        if session.expires_at <= Utc::now() {
            let _ = self
                .repo
                .delete_session_by_hash(&self.pool, &token_hash)
                .await;

            return Err(AppError::unauthorized("Your session has expired"));
        }

        self.repo
            .touch_session(&self.pool, session.session_id)
            .await?;

        Ok(AuthenticatedSession {
            user_id: session.user_id,
            email: session.email,
            display_name: session.display_name,
            status: session.user_status,
            account_id: session.account_id,
            account_slug: session.account_slug,
            account_name: session.account_name,
            account_type: session.account_type,
            role_code: session.role_code,
            expires_at: session.expires_at,
        })
    }

    pub async fn logout(&self, raw_token: Option<&str>) -> Result<(), AppError> {
        if let Some(raw_token) = raw_token {
            let token_hash = hash_session_token(raw_token);
            self.repo
                .delete_session_by_hash(&self.pool, &token_hash)
                .await?;
        }

        Ok(())
    }
}

fn normalize_email(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

fn hash_password(password: &str) -> Result<String> {
    let mut salt_bytes = [0_u8; 16];
    rand::rng().fill(&mut salt_bytes);

    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|error| anyhow::anyhow!("failed to encode password salt: {error}"))?;
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| anyhow::anyhow!("failed to hash password: {error}"))?
        .to_string();

    Ok(password_hash)
}

fn verify_password(user: &UserRecord, password: &str) -> Result<(), AppError> {
    let parsed_hash = PasswordHash::new(&user.password_hash).map_err(|error| {
        warn!(user_id = %user.id, ?error, "stored password hash could not be parsed");
        AppError::internal("Stored credentials are invalid")
    })?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::unauthorized("Invalid email or password"))
}

fn hash_session_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

impl SessionToken {
    pub fn generate() -> Self {
        let mut random_bytes = [0_u8; 32];
        rand::rng().fill(&mut random_bytes);

        let raw = URL_SAFE_NO_PAD.encode(random_bytes);
        let hash = hash_session_token(&raw);

        Self { raw, hash }
    }
}
