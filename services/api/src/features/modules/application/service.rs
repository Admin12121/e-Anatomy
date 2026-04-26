use sqlx::PgPool;

use crate::features::modules::{
    domain::models::ModuleListResponse, infrastructure::repository::ModuleRepository,
};
use crate::infrastructure::error::AppError;

#[derive(Clone)]
pub struct ModuleService {
    pool: PgPool,
    repo: ModuleRepository,
}

impl ModuleService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            repo: ModuleRepository,
        }
    }

    pub async fn list_for_account(
        &self,
        account_id: uuid::Uuid,
    ) -> Result<ModuleListResponse, AppError> {
        let items = self.repo.list_for_account(&self.pool, account_id).await?;

        Ok(ModuleListResponse {
            total: items.len(),
            items,
        })
    }
}
