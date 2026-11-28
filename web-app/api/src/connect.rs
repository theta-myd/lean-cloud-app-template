use axum::body::Bytes;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use prost::Message;
use serde::de::DeserializeOwned;
use serde::Serialize;

pub const CONTENT_TYPE_JSON: &str = "application/json";
pub const CONTENT_TYPE_PROTO: &str = "application/proto";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectCodec {
    Json,
    Proto,
}

impl ConnectCodec {
    pub fn from_headers(headers: &HeaderMap) -> Result<Self, ConnectError> {
        let content_type = headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or(CONTENT_TYPE_JSON);

        let media_type = content_type
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();

        match media_type.as_str() {
            CONTENT_TYPE_JSON => Ok(Self::Json),
            CONTENT_TYPE_PROTO => Ok(Self::Proto),
            _ => Err(ConnectError::unsupported_media_type(format!(
                "unsupported content-type '{content_type}'; expected {CONTENT_TYPE_JSON} or {CONTENT_TYPE_PROTO}"
            ))),
        }
    }

    pub fn content_type(self) -> &'static str {
        match self {
            Self::Json => CONTENT_TYPE_JSON,
            Self::Proto => CONTENT_TYPE_PROTO,
        }
    }

    pub fn decode<T>(self, body: &Bytes) -> Result<T, ConnectError>
    where
        T: Message + Default + DeserializeOwned,
    {
        match self {
            Self::Json => {
                if body.is_empty() {
                    return Ok(T::default());
                }
                serde_json::from_slice(body).map_err(|err| {
                    ConnectError::invalid_argument(format!("invalid Connect JSON payload: {err}"))
                })
            }
            Self::Proto => T::decode(body.as_ref()).map_err(|err| {
                ConnectError::invalid_argument(format!("invalid Connect protobuf payload: {err}"))
            }),
        }
    }

    pub fn encode_response<T>(self, message: &T) -> Result<Response, ConnectError>
    where
        T: Message + Serialize,
    {
        let payload = match self {
            Self::Json => serde_json::to_vec(message).map_err(|err| {
                tracing::error!(error = %err, "failed to serialize Connect JSON response");
                ConnectError::internal("internal server error")
            })?,
            Self::Proto => message.encode_to_vec(),
        };

        let mut response = (StatusCode::OK, payload).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(self.content_type()),
        );
        Ok(response)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectCode {
    InvalidArgument,
    Unauthenticated,
    PermissionDenied,
    NotFound,
    Internal,
}

impl ConnectCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidArgument => "invalid_argument",
            Self::Unauthenticated => "unauthenticated",
            Self::PermissionDenied => "permission_denied",
            Self::NotFound => "not_found",
            Self::Internal => "internal",
        }
    }

    pub fn http_status(self) -> StatusCode {
        match self {
            Self::InvalidArgument => StatusCode::BAD_REQUEST,
            Self::Unauthenticated => StatusCode::UNAUTHORIZED,
            Self::PermissionDenied => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ConnectError {
    pub code: ConnectCode,
    pub message: String,
    http_status_override: Option<StatusCode>,
}

impl ConnectError {
    pub fn new(code: ConnectCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            http_status_override: None,
        }
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new(ConnectCode::InvalidArgument, message)
    }

    pub fn unauthenticated(message: impl Into<String>) -> Self {
        Self::new(ConnectCode::Unauthenticated, message)
    }

    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::new(ConnectCode::PermissionDenied, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ConnectCode::NotFound, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ConnectCode::Internal, message)
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self {
            code: ConnectCode::InvalidArgument,
            message: message.into(),
            http_status_override: Some(StatusCode::UNSUPPORTED_MEDIA_TYPE),
        }
    }

    pub fn status_code(&self) -> StatusCode {
        self.http_status_override
            .unwrap_or_else(|| self.code.http_status())
    }
}

#[derive(Serialize)]
struct ConnectErrorBody<'a> {
    code: &'a str,
    message: &'a str,
}

impl IntoResponse for ConnectError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = serde_json::to_vec(&ConnectErrorBody {
            code: self.code.as_str(),
            message: &self.message,
        })
        .unwrap_or_else(|_| {
            br#"{"code":"internal","message":"failed to encode error response"}"#.to_vec()
        });

        let mut response = (status, body).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(CONTENT_TYPE_JSON),
        );
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::tenant::v1::{EnsurePersonalTenantResponse, Tenant, TenantRole};
    use pbjson_types::Timestamp;

    #[test]
    fn connect_json_round_trip_uses_proto3_camel_case_enum_and_rfc3339() {
        let msg = EnsurePersonalTenantResponse {
            tenant: Some(Tenant {
                id: "11111111-1111-4111-8111-111111111111".to_string(),
                name: "Alice Workspace".to_string(),
                slug: "personal-1111".to_string(),
                role: TenantRole::Owner as i32,
                is_personal: true,
                created_at: Some(Timestamp {
                    seconds: 1_795_824_000,
                    nanos: 0,
                }),
            }),
            created: true,
        };

        let json_bytes = serde_json::to_vec(&msg).expect("serialize Connect JSON");
        let json_val: serde_json::Value =
            serde_json::from_slice(&json_bytes).expect("parse JSON value");

        assert_eq!(json_val["created"], true);
        assert_eq!(json_val["tenant"]["isPersonal"], true);
        assert_eq!(json_val["tenant"]["role"], "TENANT_ROLE_OWNER");
        let created_at_str = json_val["tenant"]["createdAt"]
            .as_str()
            .expect("createdAt should serialize as RFC 3339 string");
        let parsed = chrono::DateTime::parse_from_rfc3339(created_at_str)
            .expect("createdAt must be valid RFC 3339");
        assert_eq!(parsed.timestamp(), 1_795_824_000);

        let decoded: EnsurePersonalTenantResponse = ConnectCodec::Json
            .decode(&Bytes::from(json_bytes))
            .expect("decode Connect JSON");
        assert_eq!(decoded, msg);

        // Also confirm Z-normalized RFC 3339 timestamps from @connectrpc/connect decode cleanly.
        let z_payload = br#"{"created":true,"tenant":{"id":"11111111-1111-4111-8111-111111111111","name":"Alice Workspace","slug":"personal-1111","role":"TENANT_ROLE_OWNER","isPersonal":true,"createdAt":"2026-11-28T00:00:00Z"}}"#;
        let decoded_z: EnsurePersonalTenantResponse = ConnectCodec::Json
            .decode(&Bytes::from_static(z_payload))
            .expect("decode Z-normalized RFC 3339 Connect JSON");
        assert_eq!(decoded_z, msg);
    }

    #[test]
    fn connect_proto_round_trip_decodes_and_encodes() {
        let msg = EnsurePersonalTenantResponse {
            tenant: Some(Tenant {
                id: "22222222-2222-4222-8222-222222222222".to_string(),
                name: "Bob Workspace".to_string(),
                slug: "personal-2222".to_string(),
                role: TenantRole::Member as i32,
                is_personal: true,
                created_at: Some(Timestamp {
                    seconds: 1_795_824_000,
                    nanos: 123_000_000,
                }),
            }),
            created: false,
        };

        let proto_bytes = Bytes::from(msg.encode_to_vec());
        let decoded: EnsurePersonalTenantResponse = ConnectCodec::Proto
            .decode(&proto_bytes)
            .expect("decode Connect protobuf");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn content_type_negotiation_handles_charset_and_rejects_unknown() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        );
        assert_eq!(
            ConnectCodec::from_headers(&headers).unwrap(),
            ConnectCodec::Json
        );

        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/proto"),
        );
        assert_eq!(
            ConnectCodec::from_headers(&headers).unwrap(),
            ConnectCodec::Proto
        );

        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"));
        let err = ConnectCodec::from_headers(&headers).unwrap_err();
        assert_eq!(err.status_code(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
}
