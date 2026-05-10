use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub internal_web_api_key: String,
    pub storage: StorageConfig,
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub root_dir: String,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            server: ServerConfig {
                host: env_or("SERVER_HOST", "0.0.0.0"),
                port: env_or_parse("SERVER_PORT", 8080)?,
            },
            database: DatabaseConfig {
                url: std::env::var("DATABASE_URL")
                    .context("DATABASE_URL must be set for the API service")?,
                max_connections: env_or_parse("DATABASE_MAX_CONNECTIONS", 10)?,
            },
            internal_web_api_key: env_or(
                "INTERNAL_WEB_API_KEY",
                "anatomy-internal-web-key-dev-only",
            ),
            storage: StorageConfig {
                root_dir: env_or("STORAGE_ROOT_DIR", "./data"),
            },
        })
    }
}

impl ServerConfig {
    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_or_parse<T>(key: &str, default: T) -> Result<T>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    match std::env::var(key) {
        Ok(value) => value
            .parse::<T>()
            .map_err(|error| anyhow::anyhow!("{key} is invalid: {error}")),
        Err(_) => Ok(default),
    }
}
