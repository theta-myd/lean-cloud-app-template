use std::sync::Arc;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

use crate::connect::ConnectError;

pub const USER_TOKEN_HEADER: &str = "x-app-user-token";
pub const EXPECTED_ISSUER: &str = "agent-ready-app-bff";
pub const EXPECTED_AUDIENCE: &str = "agent-ready-app-api";
pub const EXP_LEEWAY_SECONDS: u64 = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserClaims {
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tid: Option<String>,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser(pub UserClaims);

#[derive(Clone)]
pub struct JwtVerifier {
    decoding_key: DecodingKey,
    validation: Validation,
}

impl JwtVerifier {
    pub fn new(secret: &str) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.leeway = EXP_LEEWAY_SECONDS;
        validation.validate_exp = true;
        validation.set_issuer(&[EXPECTED_ISSUER]);
        validation.set_audience(&[EXPECTED_AUDIENCE]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);

        Self {
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            validation,
        }
    }

    pub fn verify(&self, token: &str) -> Result<UserClaims, ConnectError> {
        let token = token.trim();
        if token.is_empty() {
            return Err(ConnectError::unauthenticated(
                "missing x-app-user-token header",
            ));
        }

        let token_data =
            jsonwebtoken::decode::<UserClaims>(token, &self.decoding_key, &self.validation)
                .map_err(|err| {
                    tracing::debug!(error = %err, "rejected x-app-user-token JWT");
                    ConnectError::unauthenticated("invalid or expired x-app-user-token")
                })?;

        let claims = token_data.claims;
        if claims.sub.trim().is_empty() {
            return Err(ConnectError::unauthenticated(
                "x-app-user-token subject (sub) must not be empty",
            ));
        }

        Ok(claims)
    }
}

pub async fn require_user_token(
    State(verifier): State<Arc<JwtVerifier>>,
    mut req: Request,
    next: Next,
) -> Result<Response, ConnectError> {
    let raw_token = req
        .headers()
        .get(USER_TOKEN_HEADER)
        .ok_or_else(|| ConnectError::unauthenticated("missing x-app-user-token header"))?
        .to_str()
        .map_err(|_| ConnectError::unauthenticated("invalid x-app-user-token header encoding"))?;

    let claims = verifier.verify(raw_token)?;
    req.extensions_mut().insert(AuthenticatedUser(claims));
    Ok(next.run(req).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use jsonwebtoken::{encode, EncodingKey, Header};

    const TEST_SECRET: &str = "test-internal-api-jwt-secret-must-be-at-least-32-bytes";

    fn sign(claims: &UserClaims, secret: &str) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("encode JWT")
    }

    fn base_claims() -> UserClaims {
        let now = Utc::now().timestamp();
        UserClaims {
            iss: EXPECTED_ISSUER.to_string(),
            aud: EXPECTED_AUDIENCE.to_string(),
            sub: "user-123".to_string(),
            email: "alice@example.com".to_string(),
            name: Some("Alice".to_string()),
            tid: None,
            iat: now,
            exp: now + 60,
        }
    }

    #[test]
    fn accepts_valid_hs256_token() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let claims = base_claims();
        let token = sign(&claims, TEST_SECRET);

        let verified = verifier.verify(&token).expect("valid token should pass");
        assert_eq!(verified, claims);
    }

    #[test]
    fn accepts_token_within_ten_second_leeway() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let mut claims = base_claims();
        claims.exp = Utc::now().timestamp() - 5;
        let token = sign(&claims, TEST_SECRET);

        assert!(verifier.verify(&token).is_ok());
    }

    #[test]
    fn rejects_expired_token_past_leeway() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let mut claims = base_claims();
        claims.exp = Utc::now().timestamp() - 20;
        let token = sign(&claims, TEST_SECRET);

        let err = verifier.verify(&token).unwrap_err();
        assert_eq!(err.code, crate::connect::ConnectCode::Unauthenticated);
    }

    #[test]
    fn rejects_wrong_secret() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let token = sign(
            &base_claims(),
            "completely-different-secret-32-bytes-minimum",
        );

        let err = verifier.verify(&token).unwrap_err();
        assert_eq!(err.code, crate::connect::ConnectCode::Unauthenticated);
    }

    #[test]
    fn rejects_wrong_issuer() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let mut claims = base_claims();
        claims.iss = "other-issuer".to_string();
        let token = sign(&claims, TEST_SECRET);

        let err = verifier.verify(&token).unwrap_err();
        assert_eq!(err.code, crate::connect::ConnectCode::Unauthenticated);
    }

    #[test]
    fn rejects_wrong_audience() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let mut claims = base_claims();
        claims.aud = "other-audience".to_string();
        let token = sign(&claims, TEST_SECRET);

        let err = verifier.verify(&token).unwrap_err();
        assert_eq!(err.code, crate::connect::ConnectCode::Unauthenticated);
    }

    #[test]
    fn rejects_empty_subject() {
        let verifier = JwtVerifier::new(TEST_SECRET);
        let mut claims = base_claims();
        claims.sub = "   ".to_string();
        let token = sign(&claims, TEST_SECRET);

        let err = verifier.verify(&token).unwrap_err();
        assert_eq!(err.code, crate::connect::ConnectCode::Unauthenticated);
    }
}
