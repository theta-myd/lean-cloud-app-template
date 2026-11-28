use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::auth::UserClaims;
use crate::connect::ConnectError;
use crate::proto::datetime_to_proto_timestamp;
use crate::proto::tenant::v1::{Tenant, TenantRole};

pub const MAX_TODO_TITLE_CHARS: usize = 200;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TenantRecord {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub role: String,
    pub is_personal: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EnsuredTenantRecord {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub role: String,
    pub is_personal: bool,
    pub created_at: DateTime<Utc>,
    pub created: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TodoRecord {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub created_by_user_id: String,
    pub title: String,
    pub completed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<TenantRecord> for Tenant {
    fn from(record: TenantRecord) -> Self {
        Self {
            id: record.id.to_string(),
            name: record.name,
            slug: record.slug,
            role: role_str_to_proto(&record.role) as i32,
            is_personal: record.is_personal,
            created_at: Some(datetime_to_proto_timestamp(record.created_at)),
        }
    }
}

impl From<EnsuredTenantRecord> for Tenant {
    fn from(record: EnsuredTenantRecord) -> Self {
        Self {
            id: record.id.to_string(),
            name: record.name,
            slug: record.slug,
            role: role_str_to_proto(&record.role) as i32,
            is_personal: record.is_personal,
            created_at: Some(datetime_to_proto_timestamp(record.created_at)),
        }
    }
}

impl From<TodoRecord> for crate::proto::todo::v1::Todo {
    fn from(record: TodoRecord) -> Self {
        Self {
            id: record.id.to_string(),
            tenant_id: record.tenant_id.to_string(),
            created_by_user_id: record.created_by_user_id,
            title: record.title,
            completed: record.completed,
            created_at: Some(datetime_to_proto_timestamp(record.created_at)),
            updated_at: Some(datetime_to_proto_timestamp(record.updated_at)),
        }
    }
}

pub fn role_str_to_proto(role: &str) -> TenantRole {
    match role {
        "owner" => TenantRole::Owner,
        "admin" => TenantRole::Admin,
        "member" => TenantRole::Member,
        _ => TenantRole::Unspecified,
    }
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub async fn ensure_personal_tenant(
    pool: &PgPool,
    user_id: &str,
    display_name: &str,
    email: &str,
) -> Result<EnsuredTenantRecord, ConnectError> {
    sqlx::query_as::<_, EnsuredTenantRecord>(
        r#"
        SELECT id, name, slug, role, is_personal, created_at, created
        FROM app.ensure_personal_tenant($1, $2, $3)
        "#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(email)
    .fetch_one(pool)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, user_id = %user_id, "failed to ensure personal tenant");
        ConnectError::internal("internal server error")
    })
}

pub async fn list_user_tenants(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<TenantRecord>, ConnectError> {
    sqlx::query_as::<_, TenantRecord>(
        r#"
        SELECT id, name, slug, role, is_personal, created_at
        FROM app.list_user_tenants($1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, user_id = %user_id, "failed to list user tenants");
        ConnectError::internal("internal server error")
    })
}

pub async fn resolve_and_authorize_tenant(
    pool: &PgPool,
    claims: &UserClaims,
    request_tenant_id: &str,
) -> Result<TenantRecord, ConnectError> {
    let requested_tenant_id = if !request_tenant_id.trim().is_empty() {
        Some(parse_uuid(request_tenant_id, "tenant_id")?)
    } else if let Some(tid) = claims.tid.as_deref().filter(|v| !v.trim().is_empty()) {
        Some(parse_uuid(tid, "tid")?)
    } else {
        None
    };

    let resolved = sqlx::query_as::<_, TenantRecord>(
        r#"
        SELECT id, name, slug, role, is_personal, created_at
        FROM app.resolve_user_tenant($1, $2)
        "#,
    )
    .bind(&claims.sub)
    .bind(requested_tenant_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| {
        tracing::error!(
            error = %err,
            user_id = %claims.sub,
            requested_tenant_id = ?requested_tenant_id,
            "failed to resolve user tenant"
        );
        ConnectError::internal("internal server error")
    })?;

    if let Some(tenant) = resolved {
        return Ok(tenant);
    }

    if requested_tenant_id.is_some() {
        return Err(ConnectError::permission_denied(
            "caller is not authorized to access the requested tenant",
        ));
    }

    // No explicit tenant was requested and the user has no memberships yet:
    // auto-bootstrap their personal workspace.
    let ensured = ensure_personal_tenant(
        pool,
        &claims.sub,
        claims.name.as_deref().unwrap_or(""),
        &claims.email,
    )
    .await?;

    Ok(TenantRecord {
        id: ensured.id,
        name: ensured.name,
        slug: ensured.slug,
        role: ensured.role,
        is_personal: ensured.is_personal,
        created_at: ensured.created_at,
    })
}

/// Opens a PostgreSQL transaction and binds the transaction-local
/// `app.current_tenant_id` GUC (`is_local = true`) so PostgreSQL
/// `FORCE ROW LEVEL SECURITY` scopes all subsequent queries in this
/// transaction to `tenant_id` and automatically clears on commit/rollback.
pub async fn begin_tenant_tx<'a>(
    pool: &'a PgPool,
    tenant_id: Uuid,
) -> Result<Transaction<'a, Postgres>, ConnectError> {
    let mut tx = pool.begin().await.map_err(|err| {
        tracing::error!(error = %err, tenant_id = %tenant_id, "failed to begin database transaction");
        ConnectError::internal("internal server error")
    })?;

    sqlx::query("SELECT set_config('app.current_tenant_id', $1, true)")
        .bind(tenant_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|err| {
            tracing::error!(
                error = %err,
                tenant_id = %tenant_id,
                "failed to set transaction-local app.current_tenant_id"
            );
            ConnectError::internal("internal server error")
        })?;

    Ok(tx)
}

pub fn parse_uuid(raw: &str, field_name: &str) -> Result<Uuid, ConnectError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ConnectError::invalid_argument(format!(
            "{field_name} must not be empty"
        )));
    }
    Uuid::parse_str(trimmed)
        .map_err(|_| ConnectError::invalid_argument(format!("{field_name} must be a valid UUID")))
}

pub fn validate_todo_title(raw: &str) -> Result<String, ConnectError> {
    let trimmed = raw.trim();
    let char_len = trimmed.chars().count();
    if char_len == 0 {
        return Err(ConnectError::invalid_argument("title must not be empty"));
    }
    if char_len > MAX_TODO_TITLE_CHARS {
        return Err(ConnectError::invalid_argument(format!(
            "title must be at most {MAX_TODO_TITLE_CHARS} characters"
        )));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connect::ConnectCode;

    #[test]
    fn validate_todo_title_accepts_trimmed_non_empty_up_to_200_chars() {
        assert_eq!(validate_todo_title("  Buy milk  ").unwrap(), "Buy milk");

        let max_title = "a".repeat(MAX_TODO_TITLE_CHARS);
        assert_eq!(validate_todo_title(&max_title).unwrap(), max_title);

        let unicode_max = "あ".repeat(MAX_TODO_TITLE_CHARS);
        assert_eq!(validate_todo_title(&unicode_max).unwrap(), unicode_max);
    }

    #[test]
    fn validate_todo_title_rejects_empty_and_too_long() {
        let empty = validate_todo_title("   \t\n ").unwrap_err();
        assert_eq!(empty.code, ConnectCode::InvalidArgument);

        let too_long = "a".repeat(MAX_TODO_TITLE_CHARS + 1);
        let err = validate_todo_title(&too_long).unwrap_err();
        assert_eq!(err.code, ConnectCode::InvalidArgument);
    }

    #[test]
    fn parse_uuid_validates_format() {
        let valid = "11111111-1111-4111-8111-111111111111";
        assert_eq!(parse_uuid(valid, "id").unwrap().to_string(), valid);

        assert_eq!(
            parse_uuid("", "id").unwrap_err().code,
            ConnectCode::InvalidArgument
        );
        assert_eq!(
            parse_uuid("not-a-uuid", "id").unwrap_err().code,
            ConnectCode::InvalidArgument
        );
    }
}
