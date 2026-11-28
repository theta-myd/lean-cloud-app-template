use std::env;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use chrono::Utc;
use http_body_util::BodyExt;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use prost::Message;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use uuid::Uuid;

use lean_cloud_app_api::auth::{
    JwtVerifier, UserClaims, EXPECTED_AUDIENCE, EXPECTED_ISSUER, USER_TOKEN_HEADER,
};
use lean_cloud_app_api::connect::{CONTENT_TYPE_JSON, CONTENT_TYPE_PROTO};
use lean_cloud_app_api::proto::tenant::v1::{
    EnsurePersonalTenantRequest, EnsurePersonalTenantResponse, ListTenantsRequest,
    ListTenantsResponse, TenantRole,
};
use lean_cloud_app_api::proto::todo::v1::{
    CreateTodoRequest, CreateTodoResponse, DeleteTodoRequest, ListTodosRequest, ListTodosResponse,
    ToggleTodoRequest, ToggleTodoResponse, UpdateTodoRequest, UpdateTodoResponse,
};
use lean_cloud_app_api::{build_router, db, AppState};

const TEST_JWT_SECRET: &str = "integration-test-internal-api-jwt-secret-32-bytes-minimum";

fn migrator_database_url() -> String {
    env::var("TEST_MIGRATOR_DATABASE_URL").unwrap_or_else(|_| {
        "postgres://migrator:local-dev-migrator-password@127.0.0.1:5432/app".to_string()
    })
}

fn app_database_url() -> String {
    env::var("TEST_APP_DATABASE_URL").unwrap_or_else(|_| {
        "postgres://app_user:local-dev-app-password@127.0.0.1:5432/app".to_string()
    })
}

fn auth_database_url() -> String {
    env::var("TEST_AUTH_DATABASE_URL").unwrap_or_else(|_| {
        "postgres://auth_user:local-dev-auth-password@127.0.0.1:5432/app".to_string()
    })
}

fn mint_token(user_id: &str, email: &str, name: Option<&str>, tid: Option<&str>) -> String {
    let now = Utc::now().timestamp();
    let claims = UserClaims {
        iss: EXPECTED_ISSUER.to_string(),
        aud: EXPECTED_AUDIENCE.to_string(),
        sub: user_id.to_string(),
        email: email.to_string(),
        name: name.map(str::to_string),
        tid: tid.map(str::to_string),
        iat: now,
        exp: now + 60,
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(TEST_JWT_SECRET.as_bytes()),
    )
    .expect("mint HS256 JWT")
}

async fn post_json(
    app: &axum::Router,
    path: &str,
    token: Option<&str>,
    payload: Value,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, CONTENT_TYPE_JSON);

    if let Some(tok) = token {
        builder = builder.header(USER_TOKEN_HEADER, tok);
    }

    let request = builder
        .body(Body::from(serde_json::to_vec(&payload).unwrap()))
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: Value = serde_json::from_slice(&bytes).unwrap_or_else(|err| {
        panic!(
            "expected JSON response for {path} (status {status}): {err}; raw={}",
            String::from_utf8_lossy(&bytes)
        )
    });
    (status, body_json)
}

async fn post_proto<Req>(
    app: &axum::Router,
    path: &str,
    token: &str,
    req: &Req,
) -> (StatusCode, Vec<u8>)
where
    Req: Message,
{
    let request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, CONTENT_TYPE_PROTO)
        .header(USER_TOKEN_HEADER, token)
        .body(Body::from(req.encode_to_vec()))
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (status, bytes)
}

#[tokio::test]
async fn postgres_rls_and_connect_rpc_end_to_end() {
    // 1. Run migrations as schema owner (`migrator`).
    let migrator_pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&migrator_database_url())
        .await
        .expect("connect to local PostgreSQL as migrator (start with: docker compose --profile standard up -d --wait postgres)");

    db::run_migrations(&migrator_pool)
        .await
        .expect("sqlx migrations must succeed");

    // 2. Verify schema separation between `auth_user` and `app_user`.
    let auth_pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&auth_database_url())
        .await
        .expect("connect as auth_user");

    let auth_table_count: (i64,) = sqlx::query_as(
        r#"
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'auth'
          AND table_name IN ('user', 'session', 'account', 'verification')
        "#,
    )
    .fetch_one(&auth_pool)
    .await
    .expect("query auth schema tables as auth_user");
    assert_eq!(auth_table_count.0, 4, "all 4 Better Auth tables must exist");

    let app_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&app_database_url())
        .await
        .expect("connect as app_user (NOBYPASSRLS)");

    // Confirm app_user is strictly non-superuser and NOBYPASSRLS.
    let role_flags: (bool, bool) =
        sqlx::query_as("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            .fetch_one(&app_pool)
            .await
            .expect("inspect current_user role flags");
    assert!(!role_flags.0, "app_user must NOT be superuser");
    assert!(!role_flags.1, "app_user must have NOBYPASSRLS");

    // Confirm app_user cannot read auth."user".
    let cross_schema_err = sqlx::query("SELECT id FROM auth.\"user\" LIMIT 1")
        .fetch_optional(&app_pool)
        .await;
    assert!(
        cross_schema_err.is_err(),
        "app_user must NOT have access to auth schema"
    );

    let app = build_router(AppState {
        pool: app_pool.clone(),
        jwt_verifier: Arc::new(JwtVerifier::new(TEST_JWT_SECRET)),
    });

    // 3. Unauthenticated `/healthz` succeeds; RPC endpoints reject missing token.
    let health_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health_resp.status(), StatusCode::OK);
    let health_bytes = health_resp.into_body().collect().await.unwrap().to_bytes();
    let health_json: Value = serde_json::from_slice(&health_bytes).unwrap();
    assert_eq!(
        health_json,
        json!({"status": "ok", "service": "lean-cloud-app-api"})
    );

    let (status, err_json) = post_json(
        &app,
        "/tenant.v1.TenantService/ListTenants",
        None,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(err_json["code"], "unauthenticated");

    // 4. Create two distinct users for isolation checks.
    let run_suffix = Uuid::new_v4().simple().to_string();
    let user_a = format!("user-a-{run_suffix}");
    let user_b = format!("user-b-{run_suffix}");
    let token_a = mint_token(&user_a, "alice@example.com", Some("Alice"), None);
    let token_b = mint_token(&user_b, "bob@example.com", Some("Bob"), None);

    // 5. EnsurePersonalTenant is idempotent for User A (Connect JSON) and User B (Connect Protobuf).
    let (status, body_a1) = post_json(
        &app,
        "/tenant.v1.TenantService/EnsurePersonalTenant",
        Some(&token_a),
        json!({"displayName": "Alice Workspace"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body_a1["created"], true);
    assert_eq!(body_a1["tenant"]["name"], "Alice Workspace");
    assert_eq!(body_a1["tenant"]["role"], "TENANT_ROLE_OWNER");
    assert_eq!(body_a1["tenant"]["isPersonal"], true);
    let tenant_a_id = body_a1["tenant"]["id"].as_str().unwrap().to_string();

    // Second call must be idempotent (`created` omitted or false, same tenant ID).
    let (status, body_a2) = post_json(
        &app,
        "/tenant.v1.TenantService/EnsurePersonalTenant",
        Some(&token_a),
        json!({"displayName": "Should Not Overwrite"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!body_a2["created"].as_bool().unwrap_or(false));
    assert_eq!(body_a2["tenant"]["id"].as_str().unwrap(), tenant_a_id);

    // User B calls EnsurePersonalTenant using Connect binary protobuf (`application/proto`).
    let (status, raw_b1) = post_proto(
        &app,
        "/tenant.v1.TenantService/EnsurePersonalTenant",
        &token_b,
        &EnsurePersonalTenantRequest {
            display_name: "Bob Workspace".to_string(),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let resp_b1 = EnsurePersonalTenantResponse::decode(raw_b1.as_slice()).unwrap();
    assert!(resp_b1.created);
    let tenant_b = resp_b1.tenant.expect("tenant B present");
    assert_eq!(tenant_b.role, TenantRole::Owner as i32);
    assert!(tenant_b.is_personal);
    let tenant_b_id = tenant_b.id;
    assert_ne!(tenant_a_id, tenant_b_id);

    // ListTenants via Protobuf returns only User A's tenant.
    let (status, raw_list_a) = post_proto(
        &app,
        "/tenant.v1.TenantService/ListTenants",
        &token_a,
        &ListTenantsRequest {},
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let list_a = ListTenantsResponse::decode(raw_list_a.as_slice()).unwrap();
    assert_eq!(list_a.tenants.len(), 1);
    assert_eq!(list_a.tenants[0].id, tenant_a_id);

    // GetActiveTenant rejects unauthorized tenant_id with 403 permission_denied.
    let (status, err_json) = post_json(
        &app,
        "/tenant.v1.TenantService/GetActiveTenant",
        Some(&token_a),
        json!({"tenantId": tenant_b_id}),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(err_json["code"], "permission_denied");

    // 6. User A creates a TODO in Tenant A (Connect JSON); User B creates a TODO in Tenant B (Connect Proto).
    let (status, create_a_json) = post_json(
        &app,
        "/todo.v1.TodoService/CreateTodo",
        Some(&token_a),
        json!({"tenantId": tenant_a_id, "title": "Tenant A secret task"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let todo_a_id = create_a_json["todo"]["id"].as_str().unwrap().to_string();
    assert_eq!(create_a_json["todo"]["tenantId"], tenant_a_id);
    assert_eq!(create_a_json["todo"]["createdByUserId"], user_a);
    assert_eq!(create_a_json["todo"]["title"], "Tenant A secret task");

    let (status, raw_create_b) = post_proto(
        &app,
        "/todo.v1.TodoService/CreateTodo",
        &token_b,
        &CreateTodoRequest {
            tenant_id: tenant_b_id.clone(),
            title: "Tenant B secret task".to_string(),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let todo_b = CreateTodoResponse::decode(raw_create_b.as_slice())
        .unwrap()
        .todo
        .expect("todo B present");
    let todo_b_id = todo_b.id;

    // 7. User A updates & toggles Tenant A's TODO cleanly.
    let (status, raw_update_a) = post_proto(
        &app,
        "/todo.v1.TodoService/UpdateTodo",
        &token_a,
        &UpdateTodoRequest {
            tenant_id: tenant_a_id.clone(),
            id: todo_a_id.clone(),
            title: "Tenant A updated task".to_string(),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let updated_a = UpdateTodoResponse::decode(raw_update_a.as_slice())
        .unwrap()
        .todo
        .unwrap();
    assert_eq!(updated_a.title, "Tenant A updated task");

    let (status, raw_toggle_a) = post_proto(
        &app,
        "/todo.v1.TodoService/ToggleTodo",
        &token_a,
        &ToggleTodoRequest {
            tenant_id: tenant_a_id.clone(),
            id: todo_a_id.clone(),
            completed: true,
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let toggled_a = ToggleTodoResponse::decode(raw_toggle_a.as_slice())
        .unwrap()
        .todo
        .unwrap();
    assert!(toggled_a.completed);

    // 8. Cross-tenant RPC attacks MUST fail.
    // 8a. User A passing Tenant B's tenantId -> 403 permission_denied.
    for (path, payload) in [
        (
            "/todo.v1.TodoService/ListTodos",
            json!({"tenantId": tenant_b_id}),
        ),
        (
            "/todo.v1.TodoService/UpdateTodo",
            json!({"tenantId": tenant_b_id, "id": todo_b_id, "title": "hijacked"}),
        ),
        (
            "/todo.v1.TodoService/ToggleTodo",
            json!({"tenantId": tenant_b_id, "id": todo_b_id, "completed": true}),
        ),
        (
            "/todo.v1.TodoService/DeleteTodo",
            json!({"tenantId": tenant_b_id, "id": todo_b_id}),
        ),
    ] {
        let (status, body) = post_json(&app, path, Some(&token_a), payload).await;
        assert_eq!(
            status,
            StatusCode::FORBIDDEN,
            "expected 403 for cross-tenant {path}"
        );
        assert_eq!(body["code"], "permission_denied");
    }

    // 8b. User A passing their OWN tenantId + Tenant B's todo.id -> 404 not_found.
    for (path, payload) in [
        (
            "/todo.v1.TodoService/UpdateTodo",
            json!({"tenantId": tenant_a_id, "id": todo_b_id, "title": "hijacked"}),
        ),
        (
            "/todo.v1.TodoService/ToggleTodo",
            json!({"tenantId": tenant_a_id, "id": todo_b_id, "completed": true}),
        ),
        (
            "/todo.v1.TodoService/DeleteTodo",
            json!({"tenantId": tenant_a_id, "id": todo_b_id}),
        ),
    ] {
        let (status, body) = post_json(&app, path, Some(&token_a), payload).await;
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "expected 404 when targeting another tenant's todo via {path}"
        );
        assert_eq!(body["code"], "not_found");
    }

    // 9. DIRECT RAW SQL RLS PROOF as `app_user` (`NOBYPASSRLS`):
    // 9a. WITHOUT setting `app.current_tenant_id`, all tenant tables return ZERO rows (fail-closed!).
    let todos_without_ctx: (i64,) = sqlx::query_as("SELECT count(*) FROM app.todos")
        .fetch_one(&app_pool)
        .await
        .expect("raw SELECT app.todos without tenant context");
    assert_eq!(
        todos_without_ctx.0, 0,
        "FORCE RLS must return 0 rows from app.todos when app.current_tenant_id is unset"
    );

    let tenants_without_ctx: (i64,) = sqlx::query_as("SELECT count(*) FROM app.tenants")
        .fetch_one(&app_pool)
        .await
        .expect("raw SELECT app.tenants without tenant context");
    assert_eq!(
        tenants_without_ctx.0, 0,
        "FORCE RLS must return 0 rows from app.tenants when app.current_tenant_id is unset"
    );

    let memberships_without_ctx: (i64,) =
        sqlx::query_as("SELECT count(*) FROM app.tenant_memberships")
            .fetch_one(&app_pool)
            .await
            .expect("raw SELECT app.tenant_memberships without tenant context");
    assert_eq!(
        memberships_without_ctx.0, 0,
        "FORCE RLS must return 0 rows from app.tenant_memberships when app.current_tenant_id is unset"
    );

    // 9b. WITH `app.current_tenant_id = Tenant A`, raw SQL WITHOUT a WHERE clause
    // sees ONLY Tenant A rows and CANNOT update or delete Tenant B's row!
    let todo_b_uuid = Uuid::parse_str(&todo_b_id).unwrap();
    let tenant_a_uuid = Uuid::parse_str(&tenant_a_id).unwrap();
    let mut tx = app_pool.begin().await.unwrap();
    sqlx::query("SELECT set_config('app.current_tenant_id', $1, true)")
        .bind(&tenant_a_id)
        .execute(&mut *tx)
        .await
        .unwrap();

    let visible_tenant_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT tenant_id FROM app.todos")
        .fetch_all(&mut *tx)
        .await
        .unwrap();
    assert_eq!(visible_tenant_ids.len(), 1);
    assert_eq!(visible_tenant_ids[0].0, tenant_a_uuid);

    let update_b_res =
        sqlx::query("UPDATE app.todos SET title = 'rls-bypass-attempt' WHERE id = $1")
            .bind(todo_b_uuid)
            .execute(&mut *tx)
            .await
            .unwrap();
    assert_eq!(
        update_b_res.rows_affected(),
        0,
        "RLS must prevent updating Tenant B's row under Tenant A context"
    );

    let delete_b_res = sqlx::query("DELETE FROM app.todos WHERE id = $1")
        .bind(todo_b_uuid)
        .execute(&mut *tx)
        .await
        .unwrap();
    assert_eq!(
        delete_b_res.rows_affected(),
        0,
        "RLS must prevent deleting Tenant B's row under Tenant A context"
    );
    tx.commit().await.unwrap();

    // Verify Tenant B's TODO is completely untouched via User B's ListTodos.
    let (status, raw_list_b) = post_proto(
        &app,
        "/todo.v1.TodoService/ListTodos",
        &token_b,
        &ListTodosRequest {
            tenant_id: tenant_b_id.clone(),
            page_size: 0,
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let list_b = ListTodosResponse::decode(raw_list_b.as_slice()).unwrap();
    assert_eq!(list_b.todos.len(), 1);
    assert_eq!(list_b.todos[0].id, todo_b_id);
    assert_eq!(list_b.todos[0].title, "Tenant B secret task");
    assert!(!list_b.todos[0].completed);

    // 10. Clean up User A's TODO via DeleteTodo (Proto) and confirm empty list.
    let (status, _) = post_proto(
        &app,
        "/todo.v1.TodoService/DeleteTodo",
        &token_a,
        &DeleteTodoRequest {
            tenant_id: tenant_a_id.clone(),
            id: todo_a_id,
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, list_a_after) = post_json(
        &app,
        "/todo.v1.TodoService/ListTodos",
        Some(&token_a),
        json!({"tenantId": tenant_a_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        list_a_after["todos"]
            .as_array()
            .map(|arr| arr.is_empty())
            .unwrap_or(true),
        "Tenant A todos should be empty after delete"
    );

    // Also confirm pooled connection has NO leaked app.current_tenant_id after tx commit.
    let leaked_setting: (Option<String>,) =
        sqlx::query_as("SELECT nullif(current_setting('app.current_tenant_id', true), '')")
            .fetch_one(&app_pool)
            .await
            .unwrap();
    assert_eq!(
        leaked_setting.0, None,
        "transaction-local app.current_tenant_id must not leak onto pooled connections"
    );

    // Clean up test tenants as migrator so repeated local test runs stay tidy.
    let tenant_b_uuid = Uuid::parse_str(&tenant_b_id).unwrap();
    sqlx::query("DELETE FROM app.tenants WHERE id IN ($1, $2)")
        .bind(tenant_a_uuid)
        .bind(tenant_b_uuid)
        .execute(&migrator_pool)
        .await
        .expect("cleanup test tenants");

    app_pool.close().await;
    auth_pool.close().await;
    migrator_pool.close().await;
}

#[tokio::test]
async fn get_active_tenant_and_todos_use_claims_tid_and_auto_bootstrap() {
    let migrator_pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&migrator_database_url())
        .await
        .expect("connect as migrator");
    db::run_migrations(&migrator_pool).await.unwrap();

    let app_pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&app_database_url())
        .await
        .expect("connect as app_user");

    let app = build_router(AppState {
        pool: app_pool.clone(),
        jwt_verifier: Arc::new(JwtVerifier::new(TEST_JWT_SECRET)),
    });

    // Fresh user calling GetActiveTenant with empty tenantId auto-bootstraps personal tenant.
    let user_id = format!("user-auto-{}", Uuid::new_v4().simple());
    let token = mint_token(&user_id, "auto@example.com", Some("Auto User"), None);

    let (status, active_body) = post_json(
        &app,
        "/tenant.v1.TenantService/GetActiveTenant",
        Some(&token),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let tenant_id = active_body["tenant"]["id"].as_str().unwrap().to_string();
    assert_eq!(active_body["tenant"]["isPersonal"], true);

    // Token carrying `tid` allows omitting `tenantId` in TodoService requests.
    let token_with_tid = mint_token(
        &user_id,
        "auto@example.com",
        Some("Auto User"),
        Some(&tenant_id),
    );
    let (status, create_body) = post_json(
        &app,
        "/todo.v1.TodoService/CreateTodo",
        Some(&token_with_tid),
        json!({"title": "Via claims.tid"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(create_body["todo"]["tenantId"], tenant_id);

    // Token carrying an unauthorized `tid` must fail with 403 permission_denied.
    let random_tenant = Uuid::new_v4().to_string();
    let bad_tid_token = mint_token(
        &user_id,
        "auto@example.com",
        Some("Auto User"),
        Some(&random_tenant),
    );
    let (status, err_body) = post_json(
        &app,
        "/todo.v1.TodoService/ListTodos",
        Some(&bad_tid_token),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(err_body["code"], "permission_denied");

    // Cleanup.
    sqlx::query("DELETE FROM app.tenants WHERE id = $1")
        .bind(Uuid::parse_str(&tenant_id).unwrap())
        .execute(&migrator_pool)
        .await
        .unwrap();

    app_pool.close().await;
    migrator_pool.close().await;
}

#[tokio::test]
async fn get_active_tenant_rejects_invalid_uuid_and_empty_title() {
    let app_pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&app_database_url())
        .await
        .expect("connect as app_user");

    let app = build_router(AppState {
        pool: app_pool.clone(),
        jwt_verifier: Arc::new(JwtVerifier::new(TEST_JWT_SECRET)),
    });

    let token = mint_token("user-validation", "val@example.com", None, None);

    let (status, body) = post_json(
        &app,
        "/tenant.v1.TenantService/GetActiveTenant",
        Some(&token),
        json!({"tenantId": "not-a-uuid"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "invalid_argument");

    let (status, body) = post_json(
        &app,
        "/todo.v1.TodoService/CreateTodo",
        Some(&token),
        json!({"title": "   "}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "invalid_argument");

    app_pool.close().await;
}
