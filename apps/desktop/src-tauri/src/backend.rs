use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

pub struct OwnedBackend {
    child: Child,
    pub api_url: String,
    closing: Arc<AtomicBool>,
    #[cfg(windows)]
    _job: WindowsJob,
}

impl OwnedBackend {
    fn new(mut child: Child) -> std::io::Result<Self> {
        #[cfg(windows)]
        let job = match WindowsJob::attach(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        Ok(Self {
            child,
            api_url: String::new(),
            closing: Arc::new(AtomicBool::new(false)),
            #[cfg(windows)]
            _job: job,
        })
    }

    pub fn stop(&mut self) {
        self.closing.store(true, Ordering::SeqCst);
        if let Some(mut input) = self.child.stdin.take() {
            let _ = input.write_all(b"shutdown\n");
        }
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                _ if Instant::now() >= deadline => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return;
                }
                _ => std::thread::sleep(Duration::from_millis(25)),
            }
        }
    }
}

impl Drop for OwnedBackend {
    fn drop(&mut self) {
        self.stop();
    }
}

/// A startup stop reported by the local API; `can_restore` offers "Restore backup".
#[derive(Debug, PartialEq)]
pub struct StartupFailure {
    pub message: String,
    pub can_restore: bool,
}

impl std::fmt::Display for StartupFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for StartupFailure {}

impl StartupFailure {
    fn plain(message: &str) -> Self {
        Self {
            message: message.to_string(),
            can_restore: false,
        }
    }
}

#[derive(Debug, PartialEq)]
enum Event {
    Ready(String),
    /// A database update started; startup may take minutes.
    Busy,
    Restored,
    /// The PC was linked to the named branch.
    Linked(String),
    Failed(StartupFailure),
}

fn parse_event(line: &str) -> Option<Event> {
    let event: serde_json::Value = serde_json::from_str(line).ok()?;
    match event.get("event")?.as_str()? {
        "ready" => {
            let address = event
                .get("apiUrl")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let valid = address
                .strip_prefix("http://127.0.0.1:")
                .and_then(|port| port.parse::<u16>().ok())
                .is_some_and(|port| port > 0);
            Some(if valid {
                Event::Ready(address.to_string())
            } else {
                Event::Failed(StartupFailure::plain(
                    "Backend returned an invalid local address",
                ))
            })
        }
        "busy" => Some(Event::Busy),
        "restored" => Some(Event::Restored),
        "linked" => Some(Event::Linked(
            event
                .pointer("/branch/name")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        )),
        "error" => Some(Event::Failed(StartupFailure {
            message: event
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("Local API startup failed")
                .to_string(),
            can_restore: event.get("restore").and_then(|value| value.as_bool()) == Some(true),
        })),
        _ => None,
    }
}

// Node's CLI rejects Windows verbatim paths (\\?\), even though Rust can use them.
pub(crate) fn node_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let mut normal = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:", drive as char)),
                Prefix::VerbatimUNC(server, share) => PathBuf::from(r"\\").join(server).join(share),
                _ => return path.to_path_buf(),
            };
            normal.push(components.as_path());
            return normal;
        }
    }
    path.to_path_buf()
}

fn api_command(
    binary: &Path,
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Command {
    let mut command = Command::new(node_path(binary));
    // The environment, unlike the command line, is hidden from other Windows users.
    command
        .env("CASHIER_DATABASE_URL", database_url)
        .env("CASHIER_MYSQL_BIN", node_path(&runtime.join("mysql/bin")))
        .env("CASHIER_DATA_DIR", node_path(data))
        .arg(node_path(&runtime.join("api.mjs")))
        .arg(node_path(settings))
        .arg(node_path(&runtime.join("manifest.json")))
        .current_dir(node_path(data))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

/// The one-off "link this PC" run: the code goes in the environment, which,
/// unlike the command line, other Windows users cannot read.
fn link_command(
    binary: &Path,
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
    code: &str,
) -> Command {
    let mut command = api_command(binary, runtime, settings, data, database_url);
    command
        .arg("link-device")
        .env("CASHIER_LINK_CODE", code)
        .stdin(Stdio::null());
    command
}

/// The one-off run that finishes a link a previous start accepted. No code is
/// involved, so none is expected on this path.
fn resume_command(
    binary: &Path,
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Command {
    let mut command = api_command(binary, runtime, settings, data, database_url);
    command.arg("resume-link").stdin(Stdio::null());
    command
}

fn open_log(data: &Path) -> std::io::Result<fs::File> {
    let log_path = data.join("backend.log");
    if fs::metadata(&log_path).is_ok_and(|metadata| metadata.len() > 5 * 1024 * 1024) {
        let previous = data.join("backend.previous.log");
        if previous.exists() {
            fs::remove_file(&previous)?;
        }
        fs::rename(&log_path, previous)?;
    }
    OpenOptions::new().create(true).append(true).open(log_path)
}

/// Adds one line to backend.log (for startup events outside the local API).
pub fn note(data: &Path, line: &str) {
    if let Ok(mut log) = open_log(data) {
        let _ = writeln!(log, "{line}");
    }
}

fn node_binary() -> std::io::Result<PathBuf> {
    let binary_name = if cfg!(windows) {
        "cashier-node.exe"
    } else {
        "cashier-node"
    };
    Ok(std::env::current_exe()?.with_file_name(binary_name))
}

type Spawned = (OwnedBackend, std::process::ChildStdout, fs::File);

fn spawn_api(
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
    command_name: Option<&str>,
) -> Result<Spawned, Box<dyn std::error::Error>> {
    let mut command = api_command(&node_binary()?, runtime, settings, data, database_url);
    if let Some(name) = command_name {
        command.arg(name).stdin(Stdio::null());
    }
    spawn_owned(command, data)
}

fn spawn_owned(mut command: Command, data: &Path) -> Result<Spawned, Box<dyn std::error::Error>> {
    let log = open_log(data)?;
    command.stderr(Stdio::from(log.try_clone()?));
    let mut backend = OwnedBackend::new(command.spawn()?)?;
    let output = backend
        .child
        .stdout
        .take()
        .ok_or("Backend stdout is unavailable")?;
    Ok((backend, output, log))
}

pub fn start(
    app: &tauri::AppHandle,
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Result<OwnedBackend, Box<dyn std::error::Error>> {
    let (mut backend, output, mut log) = spawn_api(runtime, settings, data, database_url, None)?;
    let closing = Arc::clone(&backend.closing);
    let handle = app.clone();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut ready = false;
        for line in BufReader::new(output).lines().map_while(Result::ok) {
            let _ = writeln!(log, "{line}");
            if !ready && let Some(event) = parse_event(&line) {
                ready = matches!(event, Event::Ready(_));
                let failed = matches!(event, Event::Failed(_));
                let _ = sender.send(event);
                if failed {
                    return;
                }
            }
        }
        if !ready {
            let _ = sender.send(Event::Failed(StartupFailure::plain(
                "Local API exited before it was ready; check backend.log",
            )));
        } else if !closing.load(Ordering::SeqCst) {
            crate::fail_while_running(
                &handle,
                "The local API stopped unexpectedly. Close and reopen Cashier. Details are in backend.log.",
            );
        }
    });
    // A database update (backup + migration) may take minutes; ordinary starts take seconds.
    let mut limit = Duration::from_secs(30);
    loop {
        match receiver.recv_timeout(limit) {
            Ok(Event::Ready(address)) => {
                backend.api_url = address;
                return Ok(backend);
            }
            Ok(Event::Busy) => limit = Duration::from_secs(60 * 60),
            Ok(Event::Failed(failure)) => return Err(Box::new(failure)),
            Ok(Event::Restored | Event::Linked(_)) => {}
            Err(_) => return Err("Local API startup timed out; check backend.log".into()),
        }
    }
}

/// Runs the local API once in restore mode: recreates the database from the
/// backup taken before the failed update.
pub fn restore(
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let (mut backend, output, mut log) = spawn_api(
        runtime,
        settings,
        data,
        database_url,
        Some("restore-backup"),
    )?;
    let mut result = Err(StartupFailure::plain(
        "Restoring the backup stopped unexpectedly; check backend.log",
    ));
    for line in BufReader::new(output).lines().map_while(Result::ok) {
        let _ = writeln!(log, "{line}");
        match parse_event(&line) {
            Some(Event::Restored) => result = Ok(()),
            Some(Event::Failed(failure)) => result = Err(failure),
            _ => {}
        }
    }
    let _ = backend.child.wait();
    Ok(result?)
}

/// Runs the local API once in link mode (plan Phase 9): it prepares the
/// database, exchanges the code online and saves the link. Returns the branch name.
pub fn link(
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
    code: &str,
) -> Result<String, StartupFailure> {
    let spawned = node_binary()
        .map_err(Box::<dyn std::error::Error>::from)
        .and_then(|binary| {
            spawn_owned(
                link_command(&binary, runtime, settings, data, database_url, code),
                data,
            )
        });
    // the code path always finishes a link, so a missing branch name is a
    // failure rather than "nothing to do"
    read_link_result(spawned)?
        .ok_or_else(|| StartupFailure::plain("Linking stopped unexpectedly; check backend.log"))
}

/// Finishes a link a previous start accepted from online but did not complete,
/// so a PC holding a saved answer is never asked for another code.
pub fn resume_link(
    runtime: &Path,
    settings: &Path,
    data: &Path,
    database_url: &str,
) -> Result<Option<String>, StartupFailure> {
    let spawned = node_binary()
        .map_err(Box::<dyn std::error::Error>::from)
        .and_then(|binary| {
            spawn_owned(
                resume_command(&binary, runtime, settings, data, database_url),
                data,
            )
        });
    read_link_result(spawned)
}

/// A link run reports the branch it finished, or nothing when there was
/// nothing left to finish.
fn read_link_result(
    spawned: Result<Spawned, Box<dyn std::error::Error>>,
) -> Result<Option<String>, StartupFailure> {
    let (mut backend, output, mut log) =
        spawned.map_err(|error| StartupFailure::plain(&error.to_string()))?;
    let mut result = Ok(None);
    for line in BufReader::new(output).lines().map_while(Result::ok) {
        let _ = writeln!(log, "{line}");
        match parse_event(&line) {
            Some(Event::Linked(name)) => result = Ok(Some(name)),
            Some(Event::Failed(failure)) => result = Err(failure),
            _ => {}
        }
    }
    let _ = backend.child.wait();
    result
}

#[cfg(windows)]
pub(crate) struct WindowsJob(isize);

#[cfg(windows)]
impl WindowsJob {
    pub(crate) fn attach(child: &Child) -> std::io::Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };
        // All pointers refer to live handles or an initialized C-layout structure.
        // The job handle stays owned by this object until Drop closes it.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                let error = std::io::Error::last_os_error();
                CloseHandle(handle);
                return Err(error);
            }
            Ok(Self(handle as isize))
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        // This is the live, uniquely owned job handle created by attach.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn removes_verbatim_prefixes_without_changing_drive_or_unc_locations() {
        assert_eq!(
            node_path(Path::new(r"\\?\C:\Program Files\Cashier\api.mjs")),
            PathBuf::from(r"C:\Program Files\Cashier\api.mjs")
        );
        assert_eq!(
            node_path(Path::new(r"\\?\UNC\server\share\api.mjs")),
            PathBuf::from(r"\\server\share\api.mjs")
        );
    }

    #[cfg(windows)]
    #[test]
    fn node_starts_with_canonical_windows_paths_and_spaces() {
        let directory =
            std::env::temp_dir().join(format!("cashier-node-path-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("api.mjs"), "import fs from 'node:fs';console.log(fs.readFileSync(process.argv[2],'utf8')+'|'+fs.readFileSync(process.argv[3],'utf8')+'|'+process.env.CASHIER_DATABASE_URL+'|'+process.argv.join(' ').includes('mysql:'));").unwrap();
        fs::write(directory.join("settings with spaces.env"), "settings-ok").unwrap();
        fs::write(directory.join("manifest.json"), "manifest-ok").unwrap();
        let binary = fs::canonicalize(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/cashier-node-x86_64-pc-windows-msvc.exe"),
        )
        .unwrap();
        let canonical = fs::canonicalize(&directory).unwrap();
        let output = api_command(
            &binary,
            &canonical,
            &canonical.join("settings with spaces.env"),
            &canonical,
            "mysql://cashier:secret@127.0.0.1:3307/cashier",
        )
        .output()
        .unwrap();
        assert!(directory.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(&directory).unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "settings-ok|manifest-ok|mysql://cashier:secret@127.0.0.1:3307/cashier|false"
        );
    }

    #[cfg(windows)]
    #[test]
    fn closing_the_parent_pipe_allows_the_owned_child_to_exit_cleanly() {
        let executable = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/cashier-node-x86_64-pc-windows-msvc.exe");
        let child = std::process::Command::new(executable)
            .args([
                "-e",
                "process.stdin.on('end',()=>process.exit(0));process.stdin.resume();",
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .spawn()
            .expect("bundled Node must start");
        let mut owned = OwnedBackend::new(child).expect("child must be tracked");
        owned.stop();
        assert!(owned.child.try_wait().unwrap().unwrap().success());
    }

    #[cfg(windows)]
    #[test]
    fn closing_the_parent_job_terminates_a_child_that_does_not_cooperate() {
        let executable = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/cashier-node-x86_64-pc-windows-msvc.exe");
        let mut child = std::process::Command::new(executable)
            .args(["-e", "setInterval(()=>{},1000)"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .expect("bundled Node must start");
        let job = WindowsJob::attach(&child).expect("child must enter the parent job");
        drop(job);
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut stopped = false;
        while Instant::now() < deadline {
            if child.try_wait().unwrap().is_some() {
                stopped = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if !stopped {
            let _ = child.kill();
        }
        let _ = child.wait();
        assert!(stopped, "the Windows job must stop a non-cooperating child");
    }

    #[test]
    fn ready_message_exposes_only_a_valid_loopback_port() {
        assert_eq!(
            parse_event(r#"{"event":"ready","apiUrl":"http://127.0.0.1:43210"}"#),
            Some(Event::Ready("http://127.0.0.1:43210".to_string()))
        );
        for address in [
            "http://remote.example:43210",
            "http://127.0.0.1:0",
            "http://127.0.0.1:43210/path",
        ] {
            let line = format!(r#"{{"event":"ready","apiUrl":"{address}"}}"#);
            assert!(matches!(parse_event(&line), Some(Event::Failed(_))));
        }
    }

    #[test]
    fn startup_failure_is_reported_and_ordinary_logs_are_ignored() {
        assert_eq!(parse_event("Starting API"), None);
        assert_eq!(
            parse_event(r#"{"event":"error","message":"Database unavailable"}"#),
            Some(Event::Failed(StartupFailure::plain("Database unavailable")))
        );
    }

    #[test]
    fn a_failed_update_offers_the_restore_and_a_long_update_keeps_startup_waiting() {
        assert_eq!(
            parse_event(r#"{"event":"error","message":"The last update failed","restore":true}"#),
            Some(Event::Failed(StartupFailure {
                message: "The last update failed".to_string(),
                can_restore: true,
            }))
        );
        assert_eq!(parse_event(r#"{"event":"busy"}"#), Some(Event::Busy));
        assert_eq!(
            parse_event(r#"{"event":"restored"}"#),
            Some(Event::Restored)
        );
    }
    #[test]
    fn a_finished_link_reports_the_branch_name() {
        assert_eq!(
            parse_event(r#"{"event":"linked","branch":{"id":"x","name":"فرع الشمال"}}"#),
            Some(Event::Linked("فرع الشمال".to_string()))
        );
    }

    #[test]
    fn the_link_code_travels_only_in_the_environment() {
        let command = link_command(
            Path::new("node"),
            Path::new("runtime"),
            Path::new("settings.env"),
            Path::new("data"),
            "mysql://local",
            "ABCD2345",
        );
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(args.iter().all(|arg| !arg.contains("ABCD2345")));
        assert_eq!(args.last().map(String::as_str), Some("link-device"));
        assert!(command.get_envs().any(|(key, value)| {
            key == "CASHIER_LINK_CODE" && value.is_some_and(|value| value == "ABCD2345")
        }));
    }

    #[test]
    fn finishing_a_saved_link_runs_without_any_code() {
        let command = resume_command(
            Path::new("node"),
            Path::new("runtime"),
            Path::new("settings.env"),
            Path::new("data"),
            "mysql://local",
        );
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        // a resume that asked for a code could spend a second one
        assert!(!command.get_envs().any(|(key, _)| key == "CASHIER_LINK_CODE"));
        assert_eq!(args.last().map(String::as_str), Some("resume-link"));
    }
}
