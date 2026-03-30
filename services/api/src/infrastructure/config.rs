use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub auth: AuthConfig,
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
pub struct AuthConfig {
    pub cookie_name: String,
    pub cookie_secure: bool,
    pub session_ttl_hours: i64,
    pub bootstrap_admin_email: String,
    pub bootstrap_admin_password: String,
    pub bootstrap_admin_name: String,
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
            auth: AuthConfig {
                cookie_name: env_or("AUTH_COOKIE_NAME", "anatomy_session"),
                cookie_secure: env_or_parse("AUTH_COOKIE_SECURE", false)?,
                session_ttl_hours: env_or_parse("AUTH_SESSION_TTL_HOURS", 24 * 7)?,
                bootstrap_admin_email: env_or("BOOTSTRAP_ADMIN_EMAIL", "admin@gmail.com"),
                bootstrap_admin_password: env_or("BOOTSTRAP_ADMIN_PASSWORD", "admin@#12"),
                bootstrap_admin_name: env_or("BOOTSTRAP_ADMIN_NAME", "Platform Admin"),
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
