use url::Url;

use crate::config::DEEP_LINK_SCHEME;

/// Maps an incoming `leancloudapp://` deep link to a validated destination under `app_origin`.
pub fn resolve_deep_link_navigation(deep_link: &Url, app_origin: &Url) -> Result<Url, String> {
    if !deep_link.scheme().eq_ignore_ascii_case(DEEP_LINK_SCHEME) {
        return Err(format!(
            "Unsupported deep link scheme '{}'; expected '{DEEP_LINK_SCHEME}'.",
            deep_link.scheme()
        ));
    }

    let host = deep_link
        .host_str()
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();

    let mut target = match (host.as_str(), deep_link.path()) {
        ("auth", "/callback") | ("auth", "/callback/") => app_origin
            .join("/api/auth/callback/google")
            .map_err(|err| format!("Failed to construct auth callback URL: {err}"))?,
        ("open", raw_path) => {
            let relative = sanitize_relative_path(raw_path)?;
            app_origin
                .join(&relative)
                .map_err(|err| format!("Failed to construct deep link target URL: {err}"))?
        }
        _ => {
            return Err(format!(
                "Unsupported deep link target: '{}'.",
                deep_link.as_str()
            ));
        }
    };

    target.set_query(deep_link.query());
    target.set_fragment(None);

    if target.origin() != app_origin.origin() {
        return Err("Deep link resolved outside the allowed application origin.".to_string());
    }

    Ok(target)
}

fn sanitize_relative_path(raw_path: &str) -> Result<String, String> {
    if raw_path.contains('\\') || raw_path.starts_with("//") {
        return Err("Deep link path contains invalid characters.".to_string());
    }

    let trimmed = raw_path.strip_prefix('/').unwrap_or(raw_path);
    if trimmed.is_empty() {
        return Ok("/".to_string());
    }

    for segment in trimmed.split('/') {
        let lower = segment.to_ascii_lowercase();
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || lower.contains("%2e")
            || lower.contains("%2f")
            || lower.contains("%5c")
        {
            return Err("Deep link path contains an invalid segment.".to_string());
        }
    }

    Ok(format!("/{trimmed}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app_origin() -> Url {
        Url::parse("https://lean-cloud-app-xyz.a.run.app").unwrap()
    }

    #[test]
    fn maps_auth_callback_deep_link_preserving_query() {
        let link =
            Url::parse("leancloudapp://auth/callback?code=abc123&state=xyz789#ignored").unwrap();
        let resolved = resolve_deep_link_navigation(&link, &app_origin()).unwrap();
        assert_eq!(
            resolved.as_str(),
            "https://lean-cloud-app-xyz.a.run.app/api/auth/callback/google?code=abc123&state=xyz789"
        );
    }

    #[test]
    fn maps_open_route_deep_link_preserving_origin() {
        let todos = Url::parse("leancloudapp://open/todos?filter=active").unwrap();
        let resolved = resolve_deep_link_navigation(&todos, &app_origin()).unwrap();
        assert_eq!(
            resolved.as_str(),
            "https://lean-cloud-app-xyz.a.run.app/todos?filter=active"
        );

        let root = Url::parse("leancloudapp://open/").unwrap();
        let resolved_root = resolve_deep_link_navigation(&root, &app_origin()).unwrap();
        assert_eq!(
            resolved_root.as_str(),
            "https://lean-cloud-app-xyz.a.run.app/"
        );
    }

    #[test]
    fn rejects_invalid_schemes_hosts_and_traversal() {
        let origin = app_origin();
        assert!(resolve_deep_link_navigation(
            &Url::parse("https://auth/callback").unwrap(),
            &origin
        )
        .is_err());
        assert!(resolve_deep_link_navigation(
            &Url::parse("leancloudapp://unknown/path").unwrap(),
            &origin
        )
        .is_err());
        assert!(resolve_deep_link_navigation(
            &Url::parse("leancloudapp://open/%2e%2e%2fsecret").unwrap(),
            &origin
        )
        .is_err());
        assert!(resolve_deep_link_navigation(
            &Url::parse("leancloudapp://open/todos//nested").unwrap(),
            &origin
        )
        .is_err());
        assert!(resolve_deep_link_navigation(
            &Url::parse("leancloudapp://open//evil.example").unwrap(),
            &origin
        )
        .is_err());
    }
}
