mod backend;
mod link;
mod mysql;
mod update;
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

/// Starts the database and the local API, then opens the main window.
fn start(handle: &tauri::AppHandle, update: &str) -> Result<(), Box<dyn std::error::Error>> {
    let root = mysql::shared_root()?;
    mysql::ensure_shared_folder(&root)?;
    backend::note(&root, update);
    let lock = mysql::lock(&root)?;
    let settings = root.join("settings.env");
    let credentials = mysql::ensure_secrets(&settings, root.join("mysql").is_dir())?;
    let runtime = handle.path().resource_dir()?.join("runtime");
    let database = mysql::start(&runtime.join("mysql"), &root, &credentials)?;
    let database_url = database.database_url(&credentials);
    if !link::is_linked(&settings) {
        backend::note(&root, "This PC is not linked yet; showing the link screen");
        if let link::Outcome::Closed =
            link::wait_for_link(handle, &runtime, &settings, &root, &database_url)?
        {
            // MySQL stops cleanly before Cashier closes.
            drop(database);
            drop(lock);
            handle.exit(0);
            return Ok(());
        }
    }
    let backend = match backend::start(handle, &runtime, &settings, &root, &database_url) {
        Ok(backend) => backend,
        Err(error) => match error.downcast::<backend::StartupFailure>() {
            Ok(failure) if failure.can_restore => {
                let restore = move || {
                    backend::restore(&runtime, &settings, &root, &database_url)
                        .map_err(|error| error.to_string())
                };
                offer_restore(handle.clone(), failure.message, restore, (database, lock));
                return Ok(());
            }
            Ok(failure) => return Err(failure),
            Err(error) => return Err(error),
        },
    };
    let watcher = handle.clone();
    database.watch(move || {
        fail_while_running(
            &watcher,
            "The local database stopped unexpectedly. Close and reopen Cashier. Details are in mysqld.log.",
        )
    });
    let script = format!(
        "window.__CASHIER_DESKTOP_API_URL__ = {};",
        serde_json::to_string(&backend.api_url)?
    );
    *handle
        .state::<DesktopRuntime>()
        .0
        .lock()
        .map_err(|_| "Desktop runtime state is unavailable")? = Some(Owned {
        backend,
        mysql: database,
        _lock: lock,
    });
    let config = handle
        .config()
        .app
        .windows
        .first()
        .ok_or("Desktop window configuration is missing")?;
    WebviewWindowBuilder::from_config(handle, config)?
        .initialization_script(script)
        .build()?;
    link::close_window(handle);
    update::watch_for_updates(handle.clone());
    Ok(())
}

fn open_cashier(handle: tauri::AppHandle, update: &str) {
    let result = start(&handle, update);
    // Close the "Updating" window of a failed update only once the main window
    // exists: closing the last window would end the app.
    if handle.get_webview_window("main").is_some()
        && let Some(window) = handle.get_webview_window(update::UPDATING_WINDOW)
    {
        let _ = window.close();
    }
    if let Err(error) = result {
        let exit = handle.clone();
        handle
            .dialog()
            .message(error.to_string())
            .title("Cashier startup")
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .show(move |_| exit.exit(1));
    }
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
        .manage(update::PendingUpdate::default())
        .manage(link::LinkState::default())
        .invoke_handler(tauri::generate_handler![
            update::pending_update,
            update::install_update,
            link::link_device
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let update = update::install_newer_release(&handle).await;
                let _ = tauri::async_runtime::spawn_blocking(move || open_cashier(handle, &update))
                    .await;
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit)
                && let Ok(mut backend) = app.state::<DesktopRuntime>().0.lock()
                && let Some(mut owned) = backend.take()
            {
                owned.backend.stop();
                owned.mysql.stop();
            }
        });
}
