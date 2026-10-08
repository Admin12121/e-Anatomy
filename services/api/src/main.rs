mod features;
mod infrastructure;

use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

use crate::features::{
    analytics::http::routes::{
        public_routes as public_analytics_routes, routes as analytics_routes,
    },
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

    // `anatomy-api migrate` lets a deploy migrate while the previous release serves.
    if std::env::args().nth(1).as_deref() == Some("migrate") {
        info!("database migrations are up to date");
        return Ok(());
    }

    let state = AppState::new(pool, config);
    // Process-local workers cannot survive a restart. Keep completed revisions
    // usable and make interrupted imports explicit instead of polling forever.
    sqlx::query("UPDATE anatomy_image_library SET status=CASE WHEN status='encoding' AND revision>1 THEN 'ready' WHEN status='encoding' THEN 'editable' ELSE 'failed' END,error_message='Conversion interrupted by a server restart. Reupload the package to retry.',updated_at=NOW() WHERE status IN ('queued','processing','encoding')")
        .execute(&state.pool).await?;

    let interrupted_ingests = state
        .playground_service
        .fail_interrupted_ingests_from_previous_runtime()
        .await?;
    if interrupted_ingests > 0 {
        warn!(
            interrupted_ingests,
            "marked modality ingest jobs interrupted by the previous API runtime as failed"
        );
    }

    let app = Router::new()
        .nest("/api/v1/image-library", features::image_library::routes())
        .nest("/api/v1/content", features::content::routes::routes())
        .nest(
            "/api/v1/public/content",
            features::content::routes::public_routes(),
        )
        .nest("/api/v1/health", health_routes())
        .nest("/api/v1/public/analytics", public_analytics_routes())
        .nest("/api/v1/analytics", analytics_routes())
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
