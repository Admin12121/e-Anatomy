use anyhow::Result;
use sqlx::{PgPool, migrate::Migrator, postgres::PgPoolOptions};

use crate::infrastructure::config::DatabaseConfig;

static MIGRATOR: Migrator = sqlx::migrate!();

pub async fn connect_pool(config: &DatabaseConfig) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .connect(&config.url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    MIGRATOR.run(pool).await?;
    Ok(())
}
