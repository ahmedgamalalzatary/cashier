//! Forced update on open (plan 6.2): before MySQL and the local API start,
//! look for a newer release for at most a few seconds and install it.

use std::time::Duration;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

/// How long opening Cashier may wait for GitHub before starting normally.
const CHECK_LIMIT: Duration = Duration::from_secs(5);
/// A stalled download must not keep the shop on the "Updating" screen forever.
const DOWNLOAD_LIMIT: Duration = Duration::from_secs(20 * 60);

pub const UPDATING_WINDOW: &str = "updating";

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
}
