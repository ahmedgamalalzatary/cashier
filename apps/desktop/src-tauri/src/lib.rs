mod backend;
mod mysql;
use std::sync::Mutex;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

// Fields stop in this order: the API first, then MySQL, then the data lock.
struct Owned {
    backend: backend::OwnedBackend,
    mysql: mysql::OwnedMysql,
    _lock: std::fs::File,
}

struct DesktopRuntime(Mutex<Option<Owned>>);

fn fail_while_running(handle: &tauri::AppHandle, message: &'static str) {
    if handle.get_webview_window("main").is_none() {
        return;
    }
    let exit_handle = handle.clone();
    handle
        .dialog()
        .message(message)
        .title("Cashier")
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .show(move |_| exit_handle.exit(1));
}

/// After a failed database update: offer "Restore backup", which recreates the
/// database from the backup taken before the update, then closes Cashier.
/// MySQL and the data lock stay held until the choice is made and acted on.
fn offer_restore(
    handle: tauri::AppHandle,
    message: String,
    restore: impl FnOnce() -> Result<(), String> + Send + 'static,
    held: impl Send + 'static,
) {
    use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};
    let dialog = handle.dialog().clone();
    dialog
        .message(message)
        .title("Cashier startup")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Restore backup".to_string(),
            "Close".to_string(),
        ))
        .show(move |chosen| {
            if !chosen {
                drop(held);
                handle.exit(1);
                return;
            }
            std::thread::spawn(move || {
                let result = restore();
                drop(held);
                let (text, kind) = match result {
                    Ok(()) => (
                        "The backup was restored. Install the corrected version of Cashier, then open it again.".to_string(),
                        MessageDialogKind::Info,
                    ),
                    Err(error) => (error, MessageDialogKind::Error),
                };
                handle
                    .dialog()
                    .message(text)
                    .title("Cashier")
                    .kind(kind)
                    .show(move |_| handle.exit(1));
            });
        });
}

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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                let root = mysql::shared_root()?;
                mysql::ensure_shared_folder(&root)?;
                let lock = mysql::lock(&root)?;
                let settings = root.join("settings.env");
                let credentials = mysql::ensure_secrets(&settings, root.join("mysql").is_dir())?;
                let runtime = app.path().resource_dir()?.join("runtime");
                let database = mysql::start(&runtime.join("mysql"), &root, &credentials)?;
                let database_url = database.database_url(&credentials);
                let backend = match backend::start(app.handle(), &runtime, &settings, &root, &database_url) {
                    Ok(backend) => backend,
                    Err(error) => match error.downcast::<backend::StartupFailure>() {
                        Ok(failure) if failure.can_restore => {
                            let restore = move || backend::restore(&runtime, &settings, &root, &database_url).map_err(|error| error.to_string());
                            offer_restore(app.handle().clone(), failure.message, restore, (database, lock));
                            return Ok(());
                        }
                        Ok(failure) => return Err(failure),
                        Err(error) => return Err(error),
                    },
                };
                let handle = app.handle().clone();
                database.watch(move || fail_while_running(&handle, "The local database stopped unexpectedly. Close and reopen Cashier. Details are in mysqld.log."));
                let script = format!("window.__CASHIER_DESKTOP_API_URL__ = {};", serde_json::to_string(&backend.api_url)?);
                *app.state::<DesktopRuntime>().0.lock().map_err(|_| "Desktop runtime state is unavailable")? = Some(Owned { backend, mysql: database, _lock: lock });
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
                    owned.backend.stop();
                    owned.mysql.stop();
                }
        });
}
