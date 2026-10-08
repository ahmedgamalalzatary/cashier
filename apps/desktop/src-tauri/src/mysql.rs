//! The bundled MySQL server: shared data folder, credentials, first-time
//! initialization, start, health wait and graceful shutdown.

use crate::backend::node_path;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const DATABASE: &str = "cashier";
const APP_USER: &str = "cashier";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Credentials {
    pub app: String,
    pub root: String,
}

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer)
        .map_err(|error| format!("Cannot create a random password: {error}"))?;
    Ok(buffer.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn is_secret(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn setting(text: &str, key: &str) -> Option<String> {
    text.lines()
        .filter_map(|line| {
            let (name, value) = line.split_once('=')?;
            (name.trim() == key).then(|| value.trim().trim_matches('"').to_string())
        })
        .next_back()
}

fn hide_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn quiet(command: &mut Command) -> &mut Command {
    hide_window(
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null()),
    )
}

/// `C:\ProgramData\Cashier`: one database for every Windows user of this PC.
pub fn shared_root() -> Result<PathBuf, String> {
    std::env::var_os("ProgramData")
        .map(|folder| PathBuf::from(folder).join("Cashier"))
        .ok_or_else(|| "Windows did not report the ProgramData folder".to_string())
}

/// Creates the shared folder under a temporary name, lets every Windows user
/// change it, then renames it, so no user ever sees a folder they cannot use.
pub fn ensure_shared_folder(root: &Path) -> Result<(), String> {
    if root.is_dir() {
        return Ok(());
    }
    let failed = |error: &dyn std::fmt::Display| {
        format!(
            "Cannot prepare the Cashier data folder {}: {error}",
            root.display()
        )
    };
    let (Some(parent), Some(name)) = (root.parent(), root.file_name()) else {
        return Err(failed(&"it is not a folder path"));
    };
    let staging = parent.join(format!(
        "{}.setup-{}",
        name.to_string_lossy(),
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|error| failed(&error))?;
    let icacls =
        PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()))
            .join("System32/icacls.exe");
    // S-1-5-32-545 is the built-in Users group in every Windows language.
    let granted =
        quiet(
            Command::new(icacls)
                .arg(&staging)
                .args(["/grant", "*S-1-5-32-545:(OI)(CI)M", "/Q"]),
        )
        .status()
        .is_ok_and(|status| status.success());
    let renamed = granted && fs::rename(&staging, root).is_ok();
    let _ = fs::remove_dir_all(&staging);
    if renamed || root.is_dir() {
        Ok(())
    } else {
        Err(failed(&"Windows refused to share it with the other users"))
    }
}

/// Held while Cashier runs, so a second Windows user cannot start a second
/// MySQL on the same data.
pub fn lock(root: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    options.open(root.join("cashier.lock")).map_err(|error| {
        if error.raw_os_error() == Some(32) {
            "Cashier is already open in another Windows account on this PC. Close it there, then open it here.".to_string()
        } else {
            format!(
                "Cannot open the Cashier data folder {}: {error}",
                root.display()
            )
        }
    })
}

/// Returns the database passwords, creating them (and a JWT secret) the first
/// time. They are saved before the database exists and never replaced after.
pub fn ensure_secrets(settings: &Path, data_exists: bool) -> Result<Credentials, String> {
    let text = match fs::read_to_string(settings) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("Cannot read {}: {error}", settings.display())),
    };
    let app = setting(&text, "MYSQL_PASSWORD").filter(|value| is_secret(value));
    let root = setting(&text, "MYSQL_ROOT_PASSWORD").filter(|value| is_secret(value));
    if data_exists && (app.is_none() || root.is_none()) {
        return Err(format!(
            "The local database exists, but its database password is missing or damaged in {}. \
             Restore that file from a backup. Cashier will not create a new password, because the existing data would become unreachable.",
            settings.display()
        ));
    }
    let mut added = Vec::new();
    let mut keep_or_create =
        |key: &'static str, current: Option<String>, bytes: usize| -> Result<String, String> {
            if let Some(value) = current {
                return Ok(value);
            }
            let value = random_hex(bytes)?;
            added.push((key, value.clone()));
            Ok(value)
        };
    let credentials = Credentials {
        app: keep_or_create("MYSQL_PASSWORD", app, 32)?,
        root: keep_or_create("MYSQL_ROOT_PASSWORD", root, 32)?,
    };
    let jwt = setting(&text, "JWT_SECRET").filter(|value| !value.is_empty());
    keep_or_create("JWT_SECRET", jwt, 48)?;
    if added.is_empty() {
        return Ok(credentials);
    }
    let mut lines: Vec<String> = text
        .lines()
        .filter(|line| {
            let key = line.split_once('=').map(|(name, _)| name.trim());
            !added.iter().any(|(name, _)| key == Some(*name))
        })
        .map(str::to_string)
        .collect();
    lines.extend(
        added
            .iter()
            .map(|(key, value)| format!("{key}=\"{value}\"")),
    );
    let temporary = settings.with_extension("env.tmp");
    let written = File::create(&temporary)
        .and_then(|mut file| {
            file.write_all((lines.join("\n") + "\n").as_bytes())?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temporary, settings));
    if let Err(error) = written {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Cannot save {}: {error}", settings.display()));
    }
    Ok(credentials)
}

/// Hands secrets to a MySQL program through the current user's own temp folder
/// (other Windows users cannot read it); deleted when dropped.
struct SecretFile(PathBuf);

impl SecretFile {
    fn new(contents: &str) -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("cashier-{}.cnf", random_hex(16)?));
        let failed =
            |error: std::io::Error| format!("Cannot create a temporary MySQL file: {error}");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(failed)?;
        let secret = Self(path);
        file.write_all(contents.as_bytes()).map_err(failed)?;
        Ok(secret)
    }
}

impl Drop for SecretFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

// MySQL option files treat backslashes as escapes, so paths use forward slashes.
fn plain(path: &Path) -> String {
    node_path(path).display().to_string().replace('\\', "/")
}

fn defaults(options: &Path) -> String {
    format!("--defaults-file={}", plain(options))
}

/// Only this file is read, so a separately installed MySQL's my.ini never applies.
fn write_server_options(
    base: &Path,
    root: &Path,
    data: &Path,
    port: Option<u16>,
) -> Result<PathBuf, String> {
    let options = root.join("my.ini");
    let mut text = format!(
        "[mysqld]\nbasedir={}\ndatadir={}\nlog-error={}\nbind-address=127.0.0.1\nskip-name-resolve\nmysqlx=OFF\ndisable-log-bin\ninnodb_buffer_pool_size=256M\n",
        plain(base),
        plain(data),
        plain(&root.join("mysqld.log")),
    );
    if let Some(port) = port {
        text.push_str(&format!("port={port}\n"));
    }
    fs::write(&options, text)
        .map_err(|error| format!("Cannot write {}: {error}", options.display()))?;
    Ok(options)
}

fn wait_for(child: &mut Child, limit: Duration) -> Option<ExitStatus> {
    let deadline = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(windows)]
type Job = crate::backend::WindowsJob;
#[cfg(not(windows))]
type Job = ();

fn spawn_owned(command: &mut Command) -> Result<(Child, Job), String> {
    #[allow(unused_mut)]
    let mut child = quiet(command)
        .spawn()
        .map_err(|error| format!("Cannot start the bundled MySQL: {error}"))?;
    #[cfg(windows)]
    let job = crate::backend::WindowsJob::attach(&child).map_err(|error| {
        let _ = child.kill();
        let _ = child.wait();
        format!("Cannot track the bundled MySQL: {error}")
    })?;
    #[cfg(not(windows))]
    let job = ();
    Ok((child, job))
}

/// Builds the database in `mysql.partial`, then renames it, so a `mysql`
/// folder that exists is always complete.
fn initialize(base: &Path, root: &Path, credentials: &Credentials) -> Result<(), String> {
    let staging = root.join("mysql.partial");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|error| {
            format!(
                "Cannot remove the unfinished database {}: {error}",
                staging.display()
            )
        })?;
    }
    let options = write_server_options(base, root, &staging, None)?;
    // Runs inside the initialization, before any network listener exists.
    let setup = SecretFile::new(&format!(
        "RENAME USER 'root'@'localhost' TO 'root'@'127.0.0.1';\n\
         ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '{root}';\n\
         CREATE DATABASE `{DATABASE}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n\
         CREATE USER '{APP_USER}'@'127.0.0.1' IDENTIFIED BY '{app}';\n\
         GRANT ALL PRIVILEGES ON `{DATABASE}`.* TO '{APP_USER}'@'127.0.0.1';\n",
        root = credentials.root,
        app = credentials.app,
    ))?;
    let (mut child, _job) = spawn_owned(
        Command::new(node_path(&base.join("bin/mysqld.exe")))
            .arg(defaults(&options))
            .arg("--initialize-insecure")
            .arg(format!("--init-file={}", plain(&setup.0))),
    )?;
    let created =
        wait_for(&mut child, Duration::from_secs(300)).is_some_and(|status| status.success());
    drop(setup);
    if !created {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "The local database could not be created. Details are in {}.",
            root.join("mysqld.log").display()
        ));
    }
    fs::rename(&staging, root.join("mysql"))
        .map_err(|error| format!("Cannot finish creating the local database: {error}"))
}

pub struct OwnedMysql {
    pub port: u16,
    child: Arc<Mutex<Child>>,
    base: PathBuf,
    root_password: String,
    closing: Arc<AtomicBool>,
    _job: Job,
}

/// Initializes the database when needed, starts `mysqld` on a free loopback
/// port and waits until it accepts connections.
pub fn start(base: &Path, root: &Path, credentials: &Credentials) -> Result<OwnedMysql, String> {
    if !root.join("mysql").is_dir() {
        initialize(base, root, credentials)?;
    }
    let port = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .and_then(|listener| listener.local_addr())
        .map_err(|error| format!("Cannot find a free local port for MySQL: {error}"))?
        .port();
    let options = write_server_options(base, root, &root.join("mysql"), Some(port))?;
    let (child, job) =
        spawn_owned(Command::new(node_path(&base.join("bin/mysqld.exe"))).arg(defaults(&options)))?;
    let mut server = OwnedMysql {
        port,
        child: Arc::new(Mutex::new(child)),
        base: base.to_path_buf(),
        root_password: credentials.root.clone(),
        closing: Arc::new(AtomicBool::new(false)),
        _job: job,
    };
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let deadline = Instant::now() + Duration::from_secs(120);
    while !server.exited() && Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(500)).is_ok() {
            return Ok(server);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    server.stop();
    Err(format!(
        "The local database did not start. Details are in {}.",
        root.join("mysqld.log").display()
    ))
}

impl OwnedMysql {
    pub fn database_url(&self, credentials: &Credentials) -> String {
        format!(
            "mysql://{APP_USER}:{}@127.0.0.1:{}/{DATABASE}",
            credentials.app, self.port
        )
    }

    fn exited(&self) -> bool {
        self.child
            .lock()
            .map(|mut child| !matches!(child.try_wait(), Ok(None)))
            .unwrap_or(true)
    }

    /// Calls `on_exit` once if MySQL stops while Cashier still needs it.
    pub fn watch(&self, on_exit: impl FnOnce() + Send + 'static) {
        let child = Arc::clone(&self.child);
        let closing = Arc::clone(&self.closing);
        std::thread::spawn(move || {
            while !closing.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_secs(1));
                let exited = child
                    .lock()
                    .map(|mut child| !matches!(child.try_wait(), Ok(None)))
                    .unwrap_or(true);
                if exited {
                    if !closing.load(Ordering::SeqCst) {
                        on_exit();
                    }
                    return;
                }
            }
        });
    }

    /// Graceful `mysqladmin shutdown`; the process is killed only if that fails.
    pub fn stop(&mut self) {
        if self.closing.swap(true, Ordering::SeqCst) || self.exited() {
            return;
        }
        if let Ok(options) = SecretFile::new(&format!(
            "[client]\nuser=root\npassword={}\nhost=127.0.0.1\nport={}\nprotocol=TCP\nconnect-timeout=5\n",
            self.root_password, self.port
        )) && let Ok(mut admin) = quiet(
            Command::new(node_path(&self.base.join("bin/mysqladmin.exe")))
                .arg(defaults(&options.0))
                .arg("shutdown"),
        )
        .spawn()
        {
            wait_for(&mut admin, Duration::from_secs(30));
        }
        if let Ok(mut child) = self.child.lock() {
            wait_for(&mut child, Duration::from_secs(30));
        }
    }
}

impl Drop for OwnedMysql {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    const HEX64: fn(&str) -> bool =
        |value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit());

    struct Scratch(PathBuf);
    impl Scratch {
        fn new(name: &str) -> Self {
            let mut random = [0u8; 8];
            getrandom::fill(&mut random).unwrap();
            let path = std::env::temp_dir().join(format!(
                "cashier-mysql-{name}-{}",
                random
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            assert!(self.0.starts_with(std::env::temp_dir()));
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn base() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("runtime/mysql")
    }

    /// Runs one statement with the bundled client; credentials go through a file.
    fn query(port: u16, user: &str, password: &str, sql: &str) -> Result<String, String> {
        let scratch = Scratch::new("client");
        let options = scratch.0.join("client.cnf");
        fs::write(
            &options,
            format!(
                "[client]\nuser={user}\npassword={password}\nhost=127.0.0.1\nport={port}\nprotocol=TCP\n"
            ),
        )
        .unwrap();
        let output = Command::new(base().join("bin/mysql.exe"))
            .arg(format!("--defaults-file={}", options.display()))
            .args(["--batch", "--skip-column-names", "-e", sql])
            .output()
            .unwrap();
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    #[test]
    fn first_start_creates_secrets_and_keeps_other_settings() {
        let scratch = Scratch::new("secrets");
        let settings = scratch.0.join("settings.env");
        fs::write(&settings, "BRANCH_ID=\"keep-me\"\nADMIN_NAME=\"المدير\"\n").unwrap();

        let credentials = ensure_secrets(&settings, false).unwrap();

        assert!(HEX64(&credentials.app) && HEX64(&credentials.root));
        assert_ne!(credentials.app, credentials.root);
        let text = fs::read_to_string(&settings).unwrap();
        assert!(text.contains("BRANCH_ID=\"keep-me\"") && text.contains("ADMIN_NAME=\"المدير\""));
        assert!(text.contains(&format!("MYSQL_PASSWORD=\"{}\"", credentials.app)));
        assert!(text.contains(&format!("MYSQL_ROOT_PASSWORD=\"{}\"", credentials.root)));
        assert!(
            text.lines()
                .any(|line| line.starts_with("JWT_SECRET=\"") && line.len() > 60)
        );
        assert!(!scratch.0.join("settings.env.tmp").exists());
        // a later start reuses everything
        assert_eq!(ensure_secrets(&settings, true).unwrap(), credentials);
        assert_eq!(fs::read_to_string(&settings).unwrap(), text);
    }

    #[test]
    fn creates_the_settings_file_on_a_fresh_install() {
        let scratch = Scratch::new("fresh");
        let settings = scratch.0.join("settings.env");
        let credentials = ensure_secrets(&settings, false).unwrap();
        assert!(
            fs::read_to_string(&settings)
                .unwrap()
                .contains(&credentials.app)
        );
    }

    #[test]
    fn keeps_an_existing_jwt_secret() {
        let scratch = Scratch::new("jwt");
        let settings = scratch.0.join("settings.env");
        fs::write(
            &settings,
            "JWT_SECRET=\"existing-secret-with-enough-characters\"\n",
        )
        .unwrap();
        ensure_secrets(&settings, false).unwrap();
        let text = fs::read_to_string(&settings).unwrap();
        assert_eq!(text.matches("JWT_SECRET=").count(), 1);
        assert!(text.contains("existing-secret-with-enough-characters"));
    }

    #[test]
    fn replaces_broken_credentials_only_while_no_database_exists() {
        let scratch = Scratch::new("broken");
        let settings = scratch.0.join("settings.env");
        fs::write(
            &settings,
            "MYSQL_PASSWORD=\"short\"\nMYSQL_ROOT_PASSWORD=\"\"\n",
        )
        .unwrap();
        let before = fs::read_to_string(&settings).unwrap();

        let error = ensure_secrets(&settings, true).unwrap_err();
        assert!(error.contains("database password"), "{error}");
        assert_eq!(fs::read_to_string(&settings).unwrap(), before);

        let credentials = ensure_secrets(&settings, false).unwrap();
        assert!(HEX64(&credentials.app));
        assert_eq!(
            fs::read_to_string(&settings)
                .unwrap()
                .matches("MYSQL_PASSWORD=")
                .count(),
            1
        );
    }

    #[test]
    fn database_without_credentials_stops_and_changes_nothing() {
        let scratch = Scratch::new("missing");
        let settings = scratch.0.join("settings.env");
        assert!(ensure_secrets(&settings, true).is_err());
        assert!(!settings.exists());
    }

    #[test]
    fn shared_folder_lets_every_windows_user_write() {
        let scratch = Scratch::new("shared");
        let root = scratch.0.join("Cashier");

        ensure_shared_folder(&root).unwrap();
        ensure_shared_folder(&root).unwrap();

        let output = Command::new("icacls").arg(&root).output().unwrap();
        let acl = String::from_utf8_lossy(&output.stdout);
        assert!(
            acl.lines()
                .any(|line| line.contains("BUILTIN\\Users:(OI)(CI)(M)")),
            "{acl}"
        );
        assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 1);
    }

    #[test]
    fn a_second_cashier_cannot_open_the_same_data() {
        let scratch = Scratch::new("lock");
        let _first = lock(&scratch.0).unwrap();
        let error = lock(&scratch.0).unwrap_err();
        assert!(error.contains("another Windows account"), "{error}");
    }

    #[test]
    fn fresh_database_is_initialized_secured_and_reused() {
        let scratch = Scratch::new("server");
        let settings = scratch.0.join("settings.env");
        let credentials = ensure_secrets(&settings, false).unwrap();

        let mut server = start(&base(), &scratch.0, &credentials).unwrap();
        let port = server.port;
        assert!(scratch.0.join("mysql").is_dir());
        assert!(!scratch.0.join("mysql.partial").exists());
        assert_eq!(
            server.database_url(&credentials),
            format!(
                "mysql://cashier:{}@127.0.0.1:{port}/cashier",
                credentials.app
            )
        );
        let databases = query(port, "cashier", &credentials.app, "SHOW DATABASES").unwrap();
        let mut visible: Vec<_> = databases.lines().collect();
        visible.sort();
        assert_eq!(
            visible,
            ["cashier", "information_schema", "performance_schema"]
        );
        assert!(
            query(
                port,
                "cashier",
                &credentials.app,
                "SELECT user FROM mysql.user"
            )
            .is_err()
        );
        assert!(query(port, "root", "", "SELECT 1").is_err());
        assert_eq!(
            query(port, "root", &credentials.root, "SELECT 1").unwrap(),
            "1"
        );
        let accounts = query(
            port,
            "root",
            &credentials.root,
            "SELECT COUNT(*) FROM mysql.user WHERE authentication_string = '' AND account_locked = 'N'",
        )
        .unwrap();
        assert_eq!(accounts, "0");
        query(
            port,
            "cashier",
            &credentials.app,
            "CREATE TABLE cashier.kept (id INT)",
        )
        .unwrap();
        server.stop();
        assert!(query(port, "root", &credentials.root, "SELECT 1").is_err());

        let reused = ensure_secrets(&settings, true).unwrap();
        let mut again = start(&base(), &scratch.0, &reused).unwrap();
        assert_eq!(
            query(
                again.port,
                "cashier",
                &reused.app,
                "SHOW TABLES FROM cashier"
            )
            .unwrap(),
            "kept"
        );
        again.stop();
    }

    #[test]
    fn interrupted_initialization_is_redone_with_the_saved_credentials() {
        let scratch = Scratch::new("interrupted");
        let settings = scratch.0.join("settings.env");
        let credentials = ensure_secrets(&settings, false).unwrap();
        fs::create_dir_all(scratch.0.join("mysql.partial/half-built")).unwrap();

        let mut server = start(&base(), &scratch.0, &credentials).unwrap();

        assert!(!scratch.0.join("mysql.partial").exists());
        assert_eq!(
            query(server.port, "cashier", &credentials.app, "SELECT 1").unwrap(),
            "1"
        );
        server.stop();
    }

    #[test]
    fn passwords_never_reach_command_lines_or_leftover_files() {
        let scratch = Scratch::new("arguments");
        let settings = scratch.0.join("settings.env");
        let credentials = ensure_secrets(&settings, false).unwrap();
        let before: Vec<_> = fs::read_dir(std::env::temp_dir())
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();

        let mut server = start(&base(), &scratch.0, &credentials).unwrap();
        let processes = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name='mysqld.exe'\" | ForEach-Object CommandLine",
            ])
            .output()
            .unwrap();
        server.stop();

        let lines = String::from_utf8_lossy(&processes.stdout).to_string();
        assert!(lines.contains("mysqld"), "{lines}");
        for secret in [&credentials.app, &credentials.root] {
            assert!(!lines.contains(secret.as_str()));
            for file in ["mysqld.log", "my.ini"] {
                let text = fs::read_to_string(scratch.0.join(file)).unwrap_or_default();
                assert!(!text.contains(secret.as_str()), "{file} holds a password");
            }
        }
        let leftovers: Vec<_> = fs::read_dir(std::env::temp_dir())
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|path| !before.contains(path))
            .filter(|path| {
                fs::read_to_string(path).is_ok_and(|text| text.contains(&credentials.root))
            })
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }
}
