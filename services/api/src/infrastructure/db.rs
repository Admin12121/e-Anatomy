use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions};

use crate::infrastructure::config::DatabaseConfig;

pub async fn connect_pool(config: &DatabaseConfig) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .connect(&config.url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    // A rolled-back image must still start on a database a newer release has
    // migrated. Migrations are additive, so unknown applied versions are allowed.
    let mut migrator = sqlx::migrate!();
    migrator.set_ignore_missing(true);
    migrator.run(pool).await?;
    Ok(())
}
