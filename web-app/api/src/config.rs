use std::env;
use thiserror::Error;

pub const DEFAULT_PORT: u16 = 8080;
pub const DEFAULT_DATABASE_MAX_CONNECTIONS: u32 = 10;
pub const MIN_PRODUCTION_JWT_SECRET_LEN: usize = 32;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    Missing(&'static str),
    #[error("invalid environment variable {name}: {reason}")]
    Invalid { name: &'static str, reason: String },
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub internal_api_jwt_secret: String,
    pub port: u16,
    pub database_max_connections: u32,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = required_non_empty("DATABASE_URL")?;
        let internal_api_jwt_secret = required_non_empty("INTERNAL_API_JWT_SECRET")?;

        if internal_api_jwt_secret.len() < MIN_PRODUCTION_JWT_SECRET_LEN {
            #[cfg(not(debug_assertions))]
            return Err(ConfigError::Invalid {
                name: "INTERNAL_API_JWT_SECRET",
                reason: format!(
                    "must be at least {} bytes in release builds",
                    MIN_PRODUCTION_JWT_SECRET_LEN
                ),
            });

            #[cfg(debug_assertions)]
            tracing::warn!(
                min_len = MIN_PRODUCTION_JWT_SECRET_LEN,
                actual_len = internal_api_jwt_secret.len(),
                "INTERNAL_API_JWT_SECRET is shorter than recommended 32-byte minimum"
            );
        }

        let port = match env::var("PORT") {
            Ok(raw) if !raw.trim().is_empty() => {
                raw.trim()
                    .parse::<u16>()
                    .map_err(|err| ConfigError::Invalid {
                        name: "PORT",
                        reason: err.to_string(),
                    })?
            }
            _ => DEFAULT_PORT,
        };

        let database_max_connections = match env::var("DATABASE_MAX_CONNECTIONS") {
            Ok(raw) if !raw.trim().is_empty() => {
                let parsed = raw
                    .trim()
                    .parse::<u32>()
                    .map_err(|err| ConfigError::Invalid {
                        name: "DATABASE_MAX_CONNECTIONS",
                        reason: err.to_string(),
                    })?;
                if parsed == 0 {
                    return Err(ConfigError::Invalid {
                        name: "DATABASE_MAX_CONNECTIONS",
                        reason: "must be greater than 0".to_string(),
                    });
                }
                parsed
            }
            _ => DEFAULT_DATABASE_MAX_CONNECTIONS,
        };

        Ok(Self {
            database_url,
            internal_api_jwt_secret,
            port,
            database_max_connections,
        })
    }

    pub fn database_url_from_env() -> Result<String, ConfigError> {
        required_non_empty("DATABASE_URL")
    }
}

fn required_non_empty(name: &'static str) -> Result<String, ConfigError> {
    let value = env::var(name).map_err(|_| ConfigError::Missing(name))?;
    if value.trim().is_empty() {
        return Err(ConfigError::Missing(name));
    }
    Ok(value)
}
