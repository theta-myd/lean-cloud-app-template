use std::env;
use std::net::SocketAddr;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

use agent_ready_app_api::auth::JwtVerifier;
use agent_ready_app_api::config::AppConfig;
use agent_ready_app_api::{build_router, db, AppState, SERVICE_NAME};

enum CliMode {
    Serve,
    MigrateOnly,
}

fn parse_cli_mode() -> Result<CliMode, String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        None => Ok(CliMode::Serve),
        Some("--migrate-only") => {
            if let Some(extra) = args.next() {
                return Err(format!("unexpected argument: {extra}"));
            }
            Ok(CliMode::MigrateOnly)
        }
        Some(flag) => Err(format!(
            "unknown argument: {flag} (supported: --migrate-only)"
        )),
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_current_span(false)
        .flatten_event(true)
        .init();
}

#[tokio::main]
async fn main() -> ExitCode {
    init_tracing();

    let mode = match parse_cli_mode() {
        Ok(mode) => mode,
        Err(message) => {
            tracing::error!(error = %message, "invalid CLI arguments");
            return ExitCode::FAILURE;
        }
    };

    match mode {
        CliMode::MigrateOnly => match run_migrate_only().await {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                tracing::error!(error = %err, "database migration failed");
                ExitCode::FAILURE
            }
        },
        CliMode::Serve => match run_server().await {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                tracing::error!(error = %err, "api server terminated with error");
                ExitCode::FAILURE
            }
        },
    }
}

async fn run_migrate_only() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = AppConfig::database_url_from_env()?;
    tracing::info!(
        service = SERVICE_NAME,
        "connecting to PostgreSQL for migrations"
    );

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(30))
        .connect(&database_url)
        .await?;

    db::run_migrations(&pool).await?;
    pool.close().await;

    tracing::info!(
        service = SERVICE_NAME,
        "database migrations completed successfully"
    );
    Ok(())
}

async fn run_server() -> Result<(), Box<dyn std::error::Error>> {
    let config = AppConfig::from_env()?;

    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&config.database_url)
        .await?;

    let state = AppState {
        pool,
        jwt_verifier: Arc::new(JwtVerifier::new(&config.internal_api_jwt_secret)),
    };

    let app = build_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;

    tracing::info!(
        service = SERVICE_NAME,
        %addr,
        "listening for Connect RPC requests"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!(service = SERVICE_NAME, "graceful shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                let _ = signal.recv().await;
            }
            Err(err) => {
                tracing::warn!(error = %err, "failed to install SIGTERM handler");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
