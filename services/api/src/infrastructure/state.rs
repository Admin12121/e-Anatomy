use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    features::{
        analytics::application::service::AnalyticsService,
        modules::application::service::ModuleService,
        playground::application::service::PlaygroundService,
    },
    infrastructure::config::AppConfig,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub analytics_service: AnalyticsService,
    pub pool: PgPool,
    pub module_service: ModuleService,
    pub playground_service: PlaygroundService,
}

impl AppState {
    pub fn new(pool: PgPool, config: AppConfig) -> Self {
        let analytics_service =
            AnalyticsService::new(pool.clone(), config.internal_web_api_key.clone());
        let module_service = ModuleService::new(pool.clone());
        let playground_service =
            PlaygroundService::new(pool.clone(), config.storage.root_dir.clone());

        Self {
            config: Arc::new(config),
            analytics_service,
            pool,
            module_service,
            playground_service,
        }
    }
}
