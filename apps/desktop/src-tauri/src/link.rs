//! First start of an unlinked PC (plan Phase 9, D12): the "Link this PC" window
//! takes the one-time code, and the bundled Node runtime does the linking.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, mpsc};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LINK_WINDOW: &str = "link";

/// Accounts pull needs both this PC's branch and its device credential.
pub fn is_linked(settings: &Path) -> bool {
    std::fs::read_to_string(settings).ok().is_some_and(|text| {
        crate::mysql::setting(&text, "BRANCH_ID").is_some_and(|value| !value.is_empty())
            && crate::mysql::setting(&text, "DEVICE_TOKEN").is_some_and(|value| value.len() >= 32)
    })
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
    session: Mutex<LinkSession>,
}

#[derive(Default)]
struct LinkSession {
    job: Option<Job>,
    busy: bool,
    close_requested: bool,
}

impl LinkState {
    fn open(&self, job: Job) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Link state is unavailable".to_string())?;
        if session.job.is_some() || session.busy {
            return Err("نافذة الربط مستخدمة بالفعل".to_string());
        }
        *session = LinkSession {
            job: Some(job),
            ..LinkSession::default()
        };
        Ok(())
    }

    fn begin(&self) -> Result<Job, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Link state is unavailable".to_string())?;
        if session.close_requested {
            return Err("جارٍ إغلاق كاشير بعد اكتمال الربط".to_string());
        }
        if session.busy {
            return Err("جارٍ الربط، انتظر لحظة.".to_string());
        }
        let job = session
            .job
            .clone()
            .ok_or_else(|| "نافذة الربط غير متاحة".to_string())?;
        session.busy = true;
        Ok(job)
    }

    fn request_close(&self) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Link state is unavailable".to_string())?;
        session.close_requested = true;
        if !session.busy
            && let Some(job) = session.job.take()
        {
            let _ = job.done.send(Outcome::Closed);
        }
        Ok(())
    }

    fn finish(&self, success: bool) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Link state is unavailable".to_string())?;
        session.busy = false;
        if (session.close_requested || success)
            && let Some(job) = session.job.take()
        {
            let _ = job.done.send(if session.close_requested {
                Outcome::Closed
            } else {
                Outcome::Linked
            });
        }
        Ok(())
    }
}

/// Called by link.html with the code the person typed. Returns the branch name.
#[tauri::command]
pub async fn link_device(
    code: String,
    state: tauri::State<'_, LinkState>,
) -> Result<String, String> {
    let job = state.begin()?;
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
    state.finish(matches!(&result, Ok(Ok(_))))?;
    match result {
        Ok(Ok(branch)) => Ok(branch),
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
    state.open(Job {
        runtime: runtime.to_path_buf(),
        settings: settings.to_path_buf(),
        data: data.to_path_buf(),
        database_url: database_url.to_string(),
        done: sender.clone(),
    })?;
    let window =
        WebviewWindowBuilder::new(handle, LINK_WINDOW, WebviewUrl::App("link.html".into()))
            .title("Cashier")
            .inner_size(480.0, 420.0)
            .resizable(false)
            .center()
            .build()?;
    // Keep the tracked child and MySQL alive until an active link settles.
    // Closing is serialized with starting and finishing, not a separate busy check.
    let app = handle.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = app.state::<LinkState>().request_close();
        }
    });
    let outcome = receiver.recv().unwrap_or(Outcome::Closed);
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

    fn session() -> (LinkState, mpsc::Receiver<Outcome>) {
        let (sender, receiver) = mpsc::channel();
        let state = LinkState::default();
        state
            .open(Job {
                runtime: PathBuf::from("runtime"),
                settings: PathBuf::from("settings.env"),
                data: PathBuf::from("data"),
                database_url: "mysql://local".into(),
                done: sender,
            })
            .unwrap();
        (state, receiver)
    }

    #[test]
    fn closing_during_a_link_waits_for_the_child_to_finish() {
        for success in [true, false] {
            let (state, receiver) = session();
            let _job = state.begin().unwrap();
            state.request_close().unwrap();
            state.request_close().unwrap();
            assert!(
                receiver.try_recv().is_err(),
                "closing must not tear down an active child"
            );
            assert!(state.begin().is_err(), "closing cannot start a second link");
            state.finish(success).unwrap();
            assert!(matches!(receiver.try_recv(), Ok(Outcome::Closed)));
            assert!(
                receiver.try_recv().is_err(),
                "only one terminal outcome is sent"
            );
        }
    }

    #[test]
    fn an_idle_close_prevents_a_later_link_from_starting() {
        let (state, receiver) = session();
        state.request_close().unwrap();
        assert!(matches!(receiver.try_recv(), Ok(Outcome::Closed)));
        assert!(state.begin().is_err());
    }

    #[test]
    fn a_failed_attempt_can_retry_and_success_finishes_the_session_once() {
        let (state, receiver) = session();
        let _first = state.begin().unwrap();
        assert!(state.begin().is_err());
        state.finish(false).unwrap();
        assert!(receiver.try_recv().is_err());
        let _retry = state.begin().unwrap();
        state.finish(true).unwrap();
        assert!(matches!(receiver.try_recv(), Ok(Outcome::Linked)));
        assert!(state.begin().is_err());
        state.request_close().unwrap();
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn starting_and_closing_are_one_atomic_decision() {
        use std::sync::{Arc, Barrier};
        for _ in 0..32 {
            let (state, receiver) = session();
            let state = Arc::new(state);
            let barrier = Arc::new(Barrier::new(3));
            let starter = {
                let state = state.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    state.begin()
                })
            };
            let closer = {
                let state = state.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    state.request_close().unwrap();
                })
            };
            barrier.wait();
            closer.join().unwrap();
            if let Ok(_job) = starter.join().unwrap() {
                assert!(receiver.try_recv().is_err());
                state.finish(true).unwrap();
            }
            assert!(matches!(receiver.try_recv(), Ok(Outcome::Closed)));
            assert!(state.begin().is_err());
            assert!(receiver.try_recv().is_err());
        }
    }

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
            Some(
                "BRANCH_ID=\"019a1234-5678-7000-8000-000000000020\"\nDEVICE_TOKEN=\"a-device-token-with-at-least-32-characters\"\n",
            ),
        );
        assert!(is_linked(&scratch.settings()));
    }

    #[test]
    fn a_manually_configured_branch_without_a_device_token_needs_linking() {
        for (name, token) in [("no-token", ""), ("short-token", "DEVICE_TOKEN=\"x\"\n")] {
            let contents = format!("BRANCH_ID=\"019a1234-5678-7000-8000-000000000020\"\n{token}");
            assert!(!is_linked(&Scratch::new(name, Some(&contents)).settings()));
        }
    }
}
