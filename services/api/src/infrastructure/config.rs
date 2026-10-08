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
            internal_web_api_key: required_internal_api_key(
                std::env::var("INTERNAL_WEB_API_KEY")
                    .context("INTERNAL_WEB_API_KEY must be set for the API service")?,
            )?,
            storage: StorageConfig {
                root_dir: env_or("STORAGE_ROOT_DIR", "./data"),
            },
        })
    }
}

fn required_internal_api_key(value: String) -> Result<String> {
    anyhow::ensure!(
        value.len() >= 32 && value.trim() == value,
        "INTERNAL_WEB_API_KEY must be at least 32 characters with no surrounding whitespace"
    );
    anyhow::ensure!(
        cfg!(debug_assertions) || value != "anatomy-internal-web-key-dev-only",
        "INTERNAL_WEB_API_KEY must not use the known development key in production"
    );
    Ok(value)
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

#[cfg(test)]
mod tests {
    use super::required_internal_api_key;

    #[test]
    fn internal_key_must_be_explicit_and_nonempty() {
        assert!(required_internal_api_key(String::new()).is_err());
        assert!(required_internal_api_key("short".into()).is_err());
        assert!(required_internal_api_key(format!(" {}", "x".repeat(32))).is_err());
        assert!(required_internal_api_key("x".repeat(32)).is_ok());
    }
}
