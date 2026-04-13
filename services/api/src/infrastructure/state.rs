use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    features::{
        auth::application::service::AuthService, modules::application::service::ModuleService,
        playground::application::service::PlaygroundService,
    },
    infrastructure::config::AppConfig,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub pool: PgPool,
    pub auth_service: AuthService,
    pub module_service: ModuleService,
    pub playground_service: PlaygroundService,
}

impl AppState {
    pub fn new(pool: PgPool, config: AppConfig) -> Self {
        let auth_service = AuthService::new(pool.clone(), config.auth.clone());
        let module_service = ModuleService::new(pool.clone());
        let playground_service =
            PlaygroundService::new(pool.clone(), config.storage.root_dir.clone());

        Self {
            config: Arc::new(config),
            pool,
            auth_service,
            module_service,
            playground_service,
        }
    }
}
