mod features;
mod infrastructure;

use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::features::{
    health::http::routes as health_routes,
    modules::http::routes as module_routes,
    playground::http::{public_routes as public_playground_routes, routes as playground_routes},
};
use crate::infrastructure::{
    config::AppConfig,
    db::{connect_pool, run_migrations},
    state::AppState,
};

#[tokio::main]
async fn main() -> Result<()> {
    let log_filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "info,sqlx=warn".to_string());
    let log_filter = if log_filter.contains("dicom_object::meta") {
        log_filter
    } else {
        format!("{log_filter},dicom_object::meta=error")
    };

    tracing_subscriber::fmt()
        .with_env_filter(log_filter)
        .with_target(false)
        .compact()
        .init();

    let config = AppConfig::from_env()?;
    let pool = connect_pool(&config.database).await?;
    run_migrations(&pool).await?;

    let state = AppState::new(pool, config);

    let app = Router::new()
        .nest("/api/v1/health", health_routes())
        .nest("/api/v1/modules", module_routes())
        .nest("/api/v1/public/playground", public_playground_routes())
        .nest("/api/v1/playground", playground_routes())
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    let listener = TcpListener::bind(state.config.server.bind_address()).await?;

    info!(
        address = %state.config.server.bind_address(),
        "anatomy api listening"
    );

    axum::serve(listener, app).await?;

    Ok(())
}
