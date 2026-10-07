mod backend;
use std::fs;
use std::sync::Mutex;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

struct DesktopRuntime(Mutex<Option<backend::OwnedBackend>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(DesktopRuntime(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let startup = (|| -> Result<(), Box<dyn std::error::Error>> {
                let data = app.path().app_data_dir()?;
                fs::create_dir_all(&data)?;
                let runtime = app.path().resource_dir()?.join("runtime");
                let settings = data.join("settings.env");
                if !settings.exists() {
                    let example = data.join("settings.example.env");
                    if !example.exists() { fs::copy(runtime.join("settings.example.env"), example)?; }
                    return Err(format!("Configure your local MySQL and admin credentials in {} before opening Cashier. On the development machine, run pnpm configure:desktop before the first launch.", settings.display()).into());
                }
                let backend = backend::start(app.handle(), &runtime, &settings, &data)?;
                let script = format!("window.__CASHIER_DESKTOP_API_URL__ = {};", serde_json::to_string(&backend.api_url)?);
                *app.state::<DesktopRuntime>().0.lock().map_err(|_| "Desktop runtime state is unavailable")? = Some(backend);
                let config = app.config().app.windows.first().ok_or("Desktop window configuration is missing")?;
                WebviewWindowBuilder::from_config(app.handle(), config)?.initialization_script(script).build()?;
                Ok(())
            })();
            if let Err(error) = startup {
                let handle = app.handle().clone();
                app.dialog().message(error.to_string()).title("Cashier startup")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error).show(move |_| handle.exit(1));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit)
                && let Ok(mut backend) = app.state::<DesktopRuntime>().0.lock()
                && let Some(mut owned) = backend.take() {
                    owned.stop();
                }
        });
}
