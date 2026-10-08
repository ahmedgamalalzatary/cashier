//! First start of an unlinked PC (plan Phase 9, D12): the "Link this PC" window
//! takes the one-time code, and the bundled Node runtime does the linking.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, mpsc};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LINK_WINDOW: &str = "link";

/// Linked means settings.env names this PC's branch.
pub fn is_linked(settings: &Path) -> bool {
    std::fs::read_to_string(settings)
        .ok()
        .and_then(|text| crate::mysql::setting(&text, "BRANCH_ID"))
        .is_some_and(|value| !value.is_empty())
}

pub enum Outcome {
    Linked,
    Closed,
}

#[derive(Clone)]
struct Job {
    runtime: PathBuf,
    settings: PathBuf,
    data: PathBuf,
    database_url: String,
    done: mpsc::Sender<Outcome>,
}

#[derive(Default)]
pub struct LinkState {
    job: Mutex<Option<Job>>,
    busy: AtomicBool,
}

/// Called by link.html with the code the person typed. Returns the branch name.
#[tauri::command]
pub async fn link_device(
    code: String,
    state: tauri::State<'_, LinkState>,
) -> Result<String, String> {
    let job = state
        .job
        .lock()
        .map_err(|_| "Link state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "هذا الجهاز مربوط بالفعل.".to_string())?;
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("جارٍ الربط، انتظر لحظة.".to_string());
    }
    let done = job.done.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::backend::link(
            &job.runtime,
            &job.settings,
            &job.data,
            &job.database_url,
            &code,
        )
    })
    .await;
    state.busy.store(false, Ordering::SeqCst);
    match result {
        Ok(Ok(branch)) => {
            let _ = done.send(Outcome::Linked);
            Ok(branch)
        }
        Ok(Err(failure)) => Err(failure.message),
        Err(error) => Err(error.to_string()),
    }
}

/// Shows the link window and waits until the PC is linked or the window is
/// closed. MySQL is already running, because linking stores the branch row.
pub fn wait_for_link(
    handle: &AppHandle,
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Result<Outcome, Box<dyn std::error::Error>> {
    let (sender, receiver) = mpsc::channel();
    let state = handle.state::<LinkState>();
    *state.job.lock().map_err(|_| "Link state is unavailable")? = Some(Job {
        runtime: runtime.to_path_buf(),
        settings: settings.to_path_buf(),
        data: data.to_path_buf(),
        database_url: database_url.to_string(),
        done: sender.clone(),
    });
    let window =
        WebviewWindowBuilder::new(handle, LINK_WINDOW, WebviewUrl::App("link.html".into()))
            .title("Cashier")
            .inner_size(480.0, 420.0)
            .resizable(false)
            .center()
            .build()?;
    // Closing the window ends Cashier, but only after MySQL stops cleanly.
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = sender.send(Outcome::Closed);
        }
    });
    let outcome = receiver.recv().unwrap_or(Outcome::Closed);
    *state.job.lock().map_err(|_| "Link state is unavailable")? = None;
    Ok(outcome)
}

/// Removes the link window once the main window is open.
pub fn close_window(handle: &AppHandle) {
    if let Some(window) = handle.get_webview_window(LINK_WINDOW) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(PathBuf);
    impl Scratch {
        fn new(name: &str, contents: Option<&str>) -> Self {
            let folder =
                std::env::temp_dir().join(format!("cashier-link-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&folder);
            std::fs::create_dir_all(&folder).unwrap();
            if let Some(text) = contents {
                std::fs::write(folder.join("settings.env"), text).unwrap();
            }
            Self(folder)
        }
        fn settings(&self) -> PathBuf {
            self.0.join("settings.env")
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_pc_without_a_branch_needs_linking() {
        assert!(!is_linked(&Scratch::new("missing", None).settings()));
        assert!(!is_linked(
            &Scratch::new("empty", Some("JWT_SECRET=\"x\"\n")).settings()
        ));
        assert!(!is_linked(
            &Scratch::new("blank", Some("BRANCH_ID=\"\"\n")).settings()
        ));
    }

    #[test]
    fn a_pc_with_its_branch_is_linked() {
        let scratch = Scratch::new(
            "linked",
            Some("BRANCH_ID=\"019a1234-5678-7000-8000-000000000020\"\n"),
        );
        assert!(is_linked(&scratch.settings()));
    }
}
