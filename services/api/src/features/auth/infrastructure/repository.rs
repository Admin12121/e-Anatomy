use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::features::auth::domain::models::{AccountSnapshot, SessionLookupRecord, UserRecord};

#[derive(Debug, Clone)]
pub struct BootstrapAdminRecord {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub password_hash: String,
}

#[derive(Debug, Clone, Default)]
pub struct AuthRepository;

impl AuthRepository {
    pub async fn upsert_bootstrap_user(
        &self,
        pool: &PgPool,
        record: &BootstrapAdminRecord,
    ) -> Result<String, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO users (id, email, password_hash, display_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE
            SET
                password_hash = users.password_hash,
                display_name = EXCLUDED.display_name,
                updated_at = NOW()
            RETURNING id
            "#,
        )
        .bind(&record.user_id)
        .bind(&record.email)
        .bind(&record.password_hash)
        .bind(&record.display_name)
        .fetch_one(pool)
        .await?;

        row.try_get("id")
    }

    pub async fn ensure_personal_account(
        &self,
        pool: &PgPool,
        owner_user_id: &str,
        slug: &str,
        name: &str,
    ) -> Result<AccountSnapshot, sqlx::Error> {
        sqlx::query_as(
            r#"
            WITH inserted AS (
                INSERT INTO accounts (owner_user_id, account_type, slug, name)
                VALUES ($1, 'system', $2, $3)
                ON CONFLICT (slug) DO UPDATE
                SET updated_at = NOW()
                RETURNING id, slug, name, account_type
            )
            SELECT
                id,
                slug,
                name,
                account_type,
                'owner' AS role_code
            FROM inserted
            "#,
        )
        .bind(owner_user_id)
        .bind(slug)
        .bind(name)
        .fetch_one(pool)
        .await
    }

    pub async fn ensure_membership(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        user_id: &str,
        role_code: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO account_memberships (account_id, user_id, role_code)
            VALUES ($1, $2, $3)
            ON CONFLICT (account_id, user_id) DO UPDATE
            SET
                role_code = EXCLUDED.role_code,
                status = 'active'
            "#,
        )
        .bind(account_id)
        .bind(user_id)
        .bind(role_code)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn find_user_by_email(
        &self,
        pool: &PgPool,
        email: &str,
    ) -> Result<Option<UserRecord>, sqlx::Error> {
        sqlx::query_as(
            r#"
            SELECT id, email, password_hash, display_name, status
            FROM users
            WHERE email = $1
            "#,
        )
        .bind(email)
        .fetch_optional(pool)
        .await
    }

    pub async fn find_primary_account_for_user(
        &self,
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<AccountSnapshot>, sqlx::Error> {
        sqlx::query_as(
            r#"
            SELECT
                accounts.id,
                accounts.slug,
                accounts.name,
                accounts.account_type,
                account_memberships.role_code
            FROM account_memberships
            INNER JOIN accounts ON accounts.id = account_memberships.account_id
            WHERE account_memberships.user_id = $1
              AND account_memberships.status = 'active'
              AND accounts.status = 'active'
            ORDER BY
                CASE WHEN account_memberships.role_code = 'owner' THEN 0 ELSE 1 END,
                account_memberships.joined_at ASC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn create_session(
        &self,
        pool: &PgPool,
        user_id: &str,
        active_account_id: Uuid,
        session_token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO auth_sessions (user_id, active_account_id, session_token_hash, expires_at)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(user_id)
        .bind(active_account_id)
        .bind(session_token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn touch_last_login(&self, pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn find_session_by_hash(
        &self,
        pool: &PgPool,
        session_token_hash: &str,
    ) -> Result<Option<SessionLookupRecord>, sqlx::Error> {
        sqlx::query_as(
            r#"
            SELECT
                auth_sessions.id AS session_id,
                users.id AS user_id,
                users.email,
                users.display_name,
                users.status AS user_status,
                accounts.id AS account_id,
                accounts.slug AS account_slug,
                accounts.name AS account_name,
                accounts.account_type,
                account_memberships.role_code,
                auth_sessions.expires_at
            FROM auth_sessions
            INNER JOIN users ON users.id = auth_sessions.user_id
            INNER JOIN accounts ON accounts.id = auth_sessions.active_account_id
            INNER JOIN account_memberships
                ON account_memberships.account_id = accounts.id
               AND account_memberships.user_id = users.id
            WHERE auth_sessions.session_token_hash = $1
              AND account_memberships.status = 'active'
              AND users.status = 'active'
            LIMIT 1
            "#,
        )
        .bind(session_token_hash)
        .fetch_optional(pool)
        .await
    }

    pub async fn touch_session(&self, pool: &PgPool, session_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1")
            .bind(session_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn delete_session_by_hash(
        &self,
        pool: &PgPool,
        session_token_hash: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM auth_sessions WHERE session_token_hash = $1")
            .bind(session_token_hash)
            .execute(pool)
            .await?;

        Ok(())
    }
}

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for AccountSnapshot {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            slug: row.try_get("slug")?,
            name: row.try_get("name")?,
            account_type: row.try_get("account_type")?,
            role_code: row.try_get("role_code")?,
        })
    }
}
