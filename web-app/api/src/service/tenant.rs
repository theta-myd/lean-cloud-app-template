use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::HeaderMap;
use axum::response::Response;

use crate::auth::AuthenticatedUser;
use crate::connect::{ConnectCodec, ConnectError};
use crate::db;
use crate::proto::tenant::v1::{
    EnsurePersonalTenantRequest, EnsurePersonalTenantResponse, GetActiveTenantRequest,
    GetActiveTenantResponse, ListTenantsRequest, ListTenantsResponse, Tenant,
};
use crate::AppState;

pub async fn ensure_personal_tenant(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: EnsurePersonalTenantRequest = codec.decode(&body)?;

    let display_name = if !req.display_name.trim().is_empty() {
        req.display_name.trim()
    } else {
        claims.name.as_deref().unwrap_or("")
    };

    let ensured =
        db::ensure_personal_tenant(&state.pool, &claims.sub, display_name, &claims.email).await?;
    let created = ensured.created;

    let response = EnsurePersonalTenantResponse {
        tenant: Some(Tenant::from(ensured)),
        created,
    };
    codec.encode_response(&response)
}

pub async fn list_tenants(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let _req: ListTenantsRequest = codec.decode(&body)?;

    let records = db::list_user_tenants(&state.pool, &claims.sub).await?;
    let response = ListTenantsResponse {
        tenants: records.into_iter().map(Tenant::from).collect(),
    };
    codec.encode_response(&response)
}

pub async fn get_active_tenant(
    State(state): State<AppState>,
    Extension(AuthenticatedUser(claims)): Extension<AuthenticatedUser>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ConnectError> {
    let codec = ConnectCodec::from_headers(&headers)?;
    let req: GetActiveTenantRequest = codec.decode(&body)?;

    let tenant = db::resolve_and_authorize_tenant(&state.pool, &claims, &req.tenant_id).await?;
    let response = GetActiveTenantResponse {
        tenant: Some(Tenant::from(tenant)),
    };
    codec.encode_response(&response)
}
