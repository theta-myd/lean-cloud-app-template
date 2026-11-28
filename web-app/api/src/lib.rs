pub mod auth;
pub mod config;
pub mod connect;
pub mod db;
pub mod proto;
pub mod service;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::auth::JwtVerifier;

pub const SERVICE_NAME: &str = "lean-cloud-app-api";
const MAX_REQUEST_BODY_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_verifier: Arc<JwtVerifier>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

async fn healthz() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: SERVICE_NAME,
    })
}

pub fn build_router(state: AppState) -> Router {
    let rpc_routes = Router::new()
        .route(
            "/tenant.v1.TenantService/EnsurePersonalTenant",
            post(service::tenant::ensure_personal_tenant),
        )
        .route(
            "/tenant.v1.TenantService/ListTenants",
            post(service::tenant::list_tenants),
        )
        .route(
            "/tenant.v1.TenantService/GetActiveTenant",
            post(service::tenant::get_active_tenant),
        )
        .route(
            "/todo.v1.TodoService/ListTodos",
            post(service::todo::list_todos),
        )
        .route(
            "/todo.v1.TodoService/CreateTodo",
            post(service::todo::create_todo),
        )
        .route(
            "/todo.v1.TodoService/UpdateTodo",
            post(service::todo::update_todo),
        )
        .route(
            "/todo.v1.TodoService/ToggleTodo",
            post(service::todo::toggle_todo),
        )
        .route(
            "/todo.v1.TodoService/DeleteTodo",
            post(service::todo::delete_todo),
        )
        .layer(middleware::from_fn_with_state(
            state.jwt_verifier.clone(),
            auth::require_user_token,
        ));

    Router::new()
        .route("/healthz", get(healthz))
        .merge(rpc_routes)
        .with_state(state)
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BODY_BYTES))
        .layer(TraceLayer::new_for_http())
}
