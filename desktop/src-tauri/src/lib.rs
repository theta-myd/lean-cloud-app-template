pub mod config;
pub mod deep_link;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[tauri::command]
fn get_app_target() -> Option<String> {
    config::resolve_app_url().map(|url| url.to_string())
}

#[tauri::command]
fn start_os_browser_oauth(app: AppHandle, auth_url: String) -> Result<(), String> {
    let parsed = Url::parse(auth_url.trim()).map_err(|err| format!("Invalid auth URL: {err}"))?;
    if !config::is_allowed_external_oauth_url(&parsed) {
        return Err("Refused to open non-OAuth URL in external browser.".to_string());
    }

    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|err| format!("Failed to open OS browser: {err}"))
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn handle_deep_links(app: &AppHandle, urls: &[Url], app_origin: Option<&Url>) {
    for raw_url in urls {
        let payload = raw_url.to_string();
        if let Some(origin) = app_origin {
            if let Ok(target) = deep_link::resolve_deep_link_navigation(raw_url, origin) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.navigate(target);
                }
            }
        }
        let _ = app.emit("deep-link://received", payload);
    }
    focus_main_window(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        focus_main_window(app);
    }));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_target,
            start_os_browser_oauth
        ])
        .setup(|app| {
            let app_url = config::resolve_app_url();
            let webview_url = match app_url.as_ref() {
                Some(url) => WebviewUrl::External(url.clone()),
                None => WebviewUrl::App("index.html".into()),
            };

            let nav_handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", webview_url)
                .title("Lean Cloud App")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .center()
                .on_navigation(move |url| {
                    if config::is_google_oauth_url(url) {
                        let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                        return false;
                    }
                    true
                })
                .build()?;

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                let _ = app.deep_link().register_all();
            }

            if let Ok(Some(initial_urls)) = app.deep_link().get_current() {
                handle_deep_links(app.handle(), &initial_urls, app_url.as_ref());
            }

            let listener_handle = app.handle().clone();
            let listener_origin = app_url.clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                handle_deep_links(&listener_handle, &urls, listener_origin.as_ref());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
