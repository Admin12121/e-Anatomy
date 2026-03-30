use sqlx::PgPool;
use uuid::Uuid;

use crate::features::modules::domain::models::ModuleListItem;

#[derive(Debug, Clone, Default)]
pub struct ModuleRepository;

impl ModuleRepository {
    pub async fn list_for_account(
        &self,
        pool: &PgPool,
        account_id: Uuid,
    ) -> Result<Vec<ModuleListItem>, sqlx::Error> {
        sqlx::query_as(
            r#"
            WITH latest_versions AS (
                SELECT DISTINCT ON (module_versions.module_id)
                    module_versions.module_id,
                    module_versions.version_no,
                    module_versions.state
                FROM module_versions
                ORDER BY module_versions.module_id, module_versions.version_no DESC
            ),
            current_releases AS (
                SELECT DISTINCT ON (published_releases.module_id)
                    published_releases.module_id,
                    published_releases.published_at
                FROM published_releases
                WHERE published_releases.is_current = TRUE
                ORDER BY published_releases.module_id, published_releases.published_at DESC
            )
            SELECT
                modules.id::text AS id,
                modules.slug,
                modules.title,
                modules.status,
                latest_versions.version_no AS latest_version_no,
                latest_versions.state AS latest_version_state,
                TO_CHAR(
                    current_releases.published_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                ) AS current_release_published_at
            FROM modules
            LEFT JOIN latest_versions ON latest_versions.module_id = modules.id
            LEFT JOIN current_releases ON current_releases.module_id = modules.id
            WHERE modules.account_id = $1
            ORDER BY modules.updated_at DESC, modules.title ASC
            "#,
        )
        .bind(account_id)
        .fetch_all(pool)
        .await
    }
}
