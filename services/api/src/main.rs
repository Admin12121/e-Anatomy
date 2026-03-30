mod bootstrap;
mod features;
mod infrastructure;

use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::bootstrap::seed::seed_default_admin;
use crate::features::{
    auth::http::routes as auth_routes, health::http::routes as health_routes,
    modules::http::routes as module_routes,
};
use crate::infrastructure::{
    config::AppConfig,
    db::{connect_pool, run_migrations},
    state::AppState,
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info,sqlx=warn".to_string()))
        .with_target(false)
        .compact()
        .init();

    let config = AppConfig::from_env()?;
    let pool = connect_pool(&config.database).await?;
    run_migrations(&pool).await?;

    let state = AppState::new(pool, config);
    seed_default_admin(&state).await?;

    let app = Router::new()
        .nest("/api/v1/health", health_routes())
        .nest("/api/v1/auth", auth_routes())
        .nest("/api/v1/modules", module_routes())
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
