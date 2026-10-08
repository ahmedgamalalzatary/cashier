//! Updates. On open (plan 6.2): before MySQL and the local API start, look for
//! a newer release for at most a few seconds and install it. While open
//! (plan 6.3): check every 30 minutes and offer an "Update available" button.

use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

/// How long opening Cashier may wait for GitHub before starting normally.
const CHECK_LIMIT: Duration = Duration::from_secs(5);
/// A stalled download must not keep the shop on the "Updating" screen forever.
const DOWNLOAD_LIMIT: Duration = Duration::from_secs(20 * 60);

pub const UPDATING_WINDOW: &str = "updating";

/// How often an open Cashier looks for a newer release (plan 6.3).
const WATCH_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// A check while Cashier is open may wait longer; nobody is waiting on it.
const WATCH_CHECK_LIMIT: Duration = Duration::from_secs(30);

/// The newer version found while Cashier is open, shown as "Update available".
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<String>>);

fn watch_interval() -> Duration {
    // Test hook for the release rehearsal; never set on shop PCs.
    std::env::var("CASHIER_UPDATE_CHECK_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|seconds| *seconds >= 5)
        .map_or(WATCH_INTERVAL, Duration::from_secs)
}

/// Looks for a newer release every 30 minutes while Cashier is open and tells
/// the screen, which shows the "Update available" button.
pub fn watch_for_updates(handle: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(watch_interval());
            let found = tauri::async_runtime::block_on(async {
                let updater = handle
                    .updater_builder()
                    .timeout(WATCH_CHECK_LIMIT)
                    .build()
                    .ok()?;
                updater.check().await.ok().flatten()
            });
            if let Some(update) = found {
                if let Ok(mut pending) = handle.state::<PendingUpdate>().0.lock() {
                    *pending = Some(update.version.clone());
                }
                let _ = handle.emit("update-available", update.version);
            }
        }
    });
}

#[tauri::command]
pub fn pending_update(state: tauri::State<'_, PendingUpdate>) -> Option<String> {
    state.0.lock().ok().and_then(|pending| pending.clone())
}

/// "Update now": closes Cashier the normal way (local API, then MySQL) and
/// reopens it; the check on open then installs the update and reopens again.
#[tauri::command]
pub fn install_update(handle: AppHandle) {
    handle.request_restart();
}

/// Percentage for the progress bar; unknown size shows an indeterminate bar.
fn percent(received: u64, total: Option<u64>) -> Option<u64> {
    total
        .filter(|total| *total > 0)
        .map(|total| (received.saturating_mul(100) / total).min(100))
}

/// Installs a newer release if one is found. On Windows a successful install
/// ends this process and the installer reopens Cashier, so returning means the
/// app should start normally; the reason is returned for the log.
pub async fn install_newer_release(handle: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        return "Update check skipped in a development build".into();
    }
    let checked = match handle.updater_builder().timeout(CHECK_LIMIT).build() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let mut update = match checked {
        Ok(Some(update)) => update,
        Ok(None) => return "Cashier is up to date".into(),
        Err(error) => return format!("Update check skipped: {error}"),
    };
    update.timeout = Some(DOWNLOAD_LIMIT);
    let window = WebviewWindowBuilder::new(
        handle,
        UPDATING_WINDOW,
        WebviewUrl::App("updating.html".into()),
    )
    .title("Cashier")
    .inner_size(420.0, 160.0)
    .resizable(false)
    .center()
    .build()
    .ok();
    let mut received = 0u64;
    let result = update
        .download_and_install(
            |chunk, total| {
                received += chunk as u64;
                if let (Some(window), Some(value)) = (&window, percent(received, total)) {
                    let _ = window.eval(format!("window.cashierProgress?.({value})"));
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(()) => format!("Installed Cashier {}", update.version),
        Err(error) => format!("Update to {} failed: {error}", update.version),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_is_a_bounded_percentage_and_unknown_size_stays_indeterminate() {
        assert_eq!(percent(0, Some(200)), Some(0));
        assert_eq!(percent(50, Some(200)), Some(25));
        assert_eq!(percent(300, Some(200)), Some(100));
        assert_eq!(percent(10, None), None);
        assert_eq!(percent(10, Some(0)), None);
    }

    #[test]
    fn opening_waits_briefly_but_a_download_may_take_long() {
        assert_eq!(CHECK_LIMIT, Duration::from_secs(5));
        assert!(DOWNLOAD_LIMIT >= Duration::from_secs(10 * 60));
    }

    #[test]
    fn an_open_cashier_checks_every_thirty_minutes() {
        assert_eq!(WATCH_INTERVAL, Duration::from_secs(30 * 60));
        assert_eq!(watch_interval(), WATCH_INTERVAL);
    }
}
