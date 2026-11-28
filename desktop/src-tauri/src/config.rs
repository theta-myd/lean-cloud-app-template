use url::Url;

pub const DEFAULT_DEV_URL: &str = "http://localhost:5173";
pub const APP_URL_ENV: &str = "LEAN_CLOUD_APP_URL";
pub const DEEP_LINK_SCHEME: &str = "agentreadyapp";

const GOOGLE_OAUTH_HOSTS: &[&str] = &["accounts.google.com", "oauth2.googleapis.com"];

/// Parses and validates the target web application URL (`http` or `https` with a host).
pub fn parse_allowed_app_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Target application URL must not be empty.".to_string());
    }

    let url = Url::parse(trimmed).map_err(|err| format!("Invalid application URL: {err}"))?;
    match url.scheme() {
        "http" | "https" => {}
        scheme => {
            return Err(format!(
                "Unsupported application URL scheme '{scheme}'; expected http or https."
            ));
        }
    }

    if url.host_str().is_none() {
        return Err("Target application URL must include a host.".to_string());
    }

    Ok(url)
}

/// Resolves the target web app URL from runtime env, compile-time env, or dev default.
pub fn resolve_app_url() -> Option<Url> {
    if let Ok(runtime_url) = std::env::var(APP_URL_ENV) {
        if let Ok(parsed) = parse_allowed_app_url(&runtime_url) {
            return Some(parsed);
        }
    }

    if let Some(compile_time_url) = option_env!("LEAN_CLOUD_APP_URL") {
        if let Ok(parsed) = parse_allowed_app_url(compile_time_url) {
            return Some(parsed);
        }
    }

    if cfg!(debug_assertions) {
        return Url::parse(DEFAULT_DEV_URL).ok();
    }

    None
}

/// Returns true when the URL targets Google OAuth endpoints blocked inside embedded WebViews.
pub fn is_google_oauth_url(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    matches!(
        url.host_str().map(str::to_ascii_lowercase).as_deref(),
        Some(host) if GOOGLE_OAUTH_HOSTS.contains(&host)
    )
}

/// Returns true for URLs allowed to launch in the OS browser for Google OAuth sign-in.
pub fn is_allowed_external_oauth_url(url: &Url) -> bool {
    if is_google_oauth_url(url) {
        return true;
    }

    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.path().starts_with("/api/auth/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_localhost_and_cloud_run_urls() {
        let dev = parse_allowed_app_url("  http://localhost:5173  ").expect("dev URL should parse");
        assert_eq!(dev.as_str(), "http://localhost:5173/");

        let prod = parse_allowed_app_url("https://agent-ready-app-abc.a.run.app")
            .expect("Cloud Run URL should parse");
        assert_eq!(prod.scheme(), "https");
        assert_eq!(prod.host_str(), Some("agent-ready-app-abc.a.run.app"));
    }

    #[test]
    fn rejects_invalid_app_urls() {
        assert!(parse_allowed_app_url("").is_err());
        assert!(parse_allowed_app_url("ftp://example.com").is_err());
        assert!(parse_allowed_app_url("javascript:alert(1)").is_err());
        assert!(parse_allowed_app_url("not-a-url").is_err());
    }

    #[test]
    fn identifies_google_oauth_urls_strictly() {
        let auth = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
        let token = Url::parse("https://oauth2.googleapis.com/token").unwrap();
        let spoofed = Url::parse("https://accounts.google.com.evil.example/auth").unwrap();
        let insecure = Url::parse("http://accounts.google.com/o/oauth2/v2/auth").unwrap();
        let local_app = Url::parse("http://localhost:5173/login").unwrap();

        assert!(is_google_oauth_url(&auth));
        assert!(is_google_oauth_url(&token));
        assert!(!is_google_oauth_url(&spoofed));
        assert!(!is_google_oauth_url(&insecure));
        assert!(!is_google_oauth_url(&local_app));
    }

    #[test]
    fn validates_external_oauth_launch_urls() {
        let better_auth = Url::parse("https://agent-ready-app.a.run.app/api/auth/sign-in/social")
            .expect("Better Auth URL should parse");
        let arbitrary = Url::parse("https://example.com/evil").unwrap();

        assert!(is_allowed_external_oauth_url(&better_auth));
        assert!(!is_allowed_external_oauth_url(&arbitrary));
    }
}
