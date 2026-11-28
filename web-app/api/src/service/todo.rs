use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::HeaderMap;
use axum::response::Response;

use crate::auth::AuthenticatedUser;
use crate::connect::{ConnectCodec, ConnectError};
use crate::db::{self, TodoRecord};
use crate::proto::todo::v1::{
    CreateTodoRequest, CreateTodoResponse, DeleteTodoRequest, DeleteTodoResponse, ListTodosRequest,
    ListTodosResponse, Todo, ToggleTodoRequest, ToggleTodoResponse, UpdateTodoRequest,
    UpdateTodoResponse,
};
use crate::AppState;

const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

pub async fn list_todos(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: ListTodosRequest = codec.decode(&body)?;

    if req.page_size < 0 {
        return Err(ConnectError::invalid_argument(
            "page_size must be non-negative",
        ));
    }
    let limit = if req.page_size == 0 {
        DEFAULT_PAGE_SIZE
    } else {
        i64::from(req.page_size).min(MAX_PAGE_SIZE)
    };

    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let mut tx = db::begin_tenant_tx(&state.pool, tenant.id).await?;

    let rows = sqlx::query_as::<_, TodoRecord>(
        r#"
        SELECT id, tenant_id, created_by_user_id, title, completed, created_at, updated_at
        FROM app.todos
        WHERE tenant_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
        "#,
    )
    .bind(tenant.id)
    .bind(limit)
    .fetch_all(&mut *tx)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to list todos");
        ConnectError::internal("internal server error")
    })?;

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to commit list_todos tx");
        ConnectError::internal("internal server error")
    })?;

    let response = ListTodosResponse {
        todos: rows.into_iter().map(Todo::from).collect(),
    };
    codec.encode_response(&response)
}

pub async fn create_todo(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: CreateTodoRequest = codec.decode(&body)?;

    let title = db::validate_todo_title(&req.title)?;
    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let mut tx = db::begin_tenant_tx(&state.pool, tenant.id).await?;

    let row = sqlx::query_as::<_, TodoRecord>(
        r#"
        INSERT INTO app.todos (tenant_id, created_by_user_id, title)
        VALUES ($1, $2, $3)
        RETURNING id, tenant_id, created_by_user_id, title, completed, created_at, updated_at
        "#,
    )
    .bind(tenant.id)
    .bind(&claims.sub)
    .bind(&title)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to create todo");
        ConnectError::internal("internal server error")
    })?;

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to commit create_todo tx");
        ConnectError::internal("internal server error")
    })?;

    let response = CreateTodoResponse {
        todo: Some(Todo::from(row)),
    };
    codec.encode_response(&response)
}

pub async fn update_todo(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: UpdateTodoRequest = codec.decode(&body)?;

    let todo_id = db::parse_uuid(&req.id, "id")?;
    let title = db::validate_todo_title(&req.title)?;
    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let mut tx = db::begin_tenant_tx(&state.pool, tenant.id).await?;

    let maybe_row = sqlx::query_as::<_, TodoRecord>(
        r#"
        UPDATE app.todos
        SET title = $1, updated_at = now()
        WHERE id = $2 AND tenant_id = $3
        RETURNING id, tenant_id, created_by_user_id, title, completed, created_at, updated_at
        "#,
    )
    .bind(&title)
    .bind(todo_id)
    .bind(tenant.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, todo_id = %todo_id, "failed to update todo");
        ConnectError::internal("internal server error")
    })?;

    let Some(row) = maybe_row else {
        return Err(ConnectError::not_found("todo not found"));
    };

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to commit update_todo tx");
        ConnectError::internal("internal server error")
    })?;

    let response = UpdateTodoResponse {
        todo: Some(Todo::from(row)),
    };
    codec.encode_response(&response)
}

pub async fn toggle_todo(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: ToggleTodoRequest = codec.decode(&body)?;

    let todo_id = db::parse_uuid(&req.id, "id")?;
    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let mut tx = db::begin_tenant_tx(&state.pool, tenant.id).await?;

    let maybe_row = sqlx::query_as::<_, TodoRecord>(
        r#"
        UPDATE app.todos
        SET completed = $1, updated_at = now()
        WHERE id = $2 AND tenant_id = $3
        RETURNING id, tenant_id, created_by_user_id, title, completed, created_at, updated_at
        "#,
    )
    .bind(req.completed)
    .bind(todo_id)
    .bind(tenant.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, todo_id = %todo_id, "failed to toggle todo");
        ConnectError::internal("internal server error")
    })?;

    let Some(row) = maybe_row else {
        return Err(ConnectError::not_found("todo not found"));
    };

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to commit toggle_todo tx");
        ConnectError::internal("internal server error")
    })?;

    let response = ToggleTodoResponse {
        todo: Some(Todo::from(row)),
    };
    codec.encode_response(&response)
}

pub async fn delete_todo(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: DeleteTodoRequest = codec.decode(&body)?;

    let todo_id = db::parse_uuid(&req.id, "id")?;
    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let mut tx = db::begin_tenant_tx(&state.pool, tenant.id).await?;

    let deleted: Option<(uuid::Uuid,)> = sqlx::query_as(
        r#"
        DELETE FROM app.todos
        WHERE id = $1 AND tenant_id = $2
        RETURNING id
        "#,
    )
    .bind(todo_id)
    .bind(tenant.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, todo_id = %todo_id, "failed to delete todo");
        ConnectError::internal("internal server error")
    })?;

    if deleted.is_none() {
        return Err(ConnectError::not_found("todo not found"));
    }

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant.id, "failed to commit delete_todo tx");
        ConnectError::internal("internal server error")
    })?;

    codec.encode_response(&DeleteTodoResponse {})
}
