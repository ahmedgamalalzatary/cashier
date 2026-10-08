# Cashier desktop

The Windows x64 installer contains the existing frontend, Express API, Node
runtime, and optional background cache worker. The app starts its own API on a
free loopback port, checks the local database, and opens the window after startup.
Closing the app stops its API; Windows also stops the owned process after an app
crash. A second launch focuses the existing window.

The app runs its own bundled MySQL; no separate MySQL installation is used.
Everything it stores (settings, database, logs) lives in `C:\ProgramData\Cashier`,
shared by every Windows user of the PC. Each Windows user installs the app once;
only one of them can have Cashier open at a time. The first start creates the
database with random passwords and an unconfigured PC says "This PC is not linked
yet". The online updater is a separate next step.

On every start the app brings the database to its own version before serving:
a new database gets its tables; when an installed update brings database changes,
the app first saves a verified backup in `C:\ProgramData\Cashier\backups` (the
newest five are kept) and then applies them. A database from a newer Cashier is
refused. If an update fails, Cashier does not open for work and offers
**Restore backup**, which brings back the data from before the update; that
version then stays blocked until a corrected version is installed.

## Try it on Windows

Install Microsoft C++ Build Tools with the **Desktop development with C++**
workload, Rust with the Windows MSVC toolchain, and WebView2. Restart your
terminal after installing Rust so Cargo is available on PATH.
Build tools require Node 20.11 or later; the installed app includes its own Node.

Set `BRANCH_ID` in the source `.env` to the UUID of this PC's branch, then import
the branch and admin settings once. The desktop
database must contain exactly that one branch; an empty or multi-branch database
is rejected. Phase 9 will supply the branch through the linking screen.

```powershell
pnpm configure:desktop
pnpm branch:desktop -- --name "Branch name"
```

`branch:desktop` is a developer/test tool only: with Cashier closed, it starts the
bundled database, creates its tables if needed and inserts the configured
`BRANCH_ID` branch. Open Cashier once before running it (the first start creates
the database). It refuses a database that already holds another branch.

Settings are saved at `C:\ProgramData\Cashier\settings.env`. Repeating the command
only adds settings the file lacks and never changes existing lines; updates keep the file. Real credentials are not
included in the installer. Edit that file to change desktop configuration;
repository `.env` changes do not overwrite it later. On another prepared machine,
create `settings.env` there using `settings.example.env`. Settings in the old
per-user folder (`%APPDATA%\com.cashier.desktop`) are no longer read; run
`pnpm configure:desktop` again. The app adds `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`
and `JWT_SECRET` on its first start. Never edit or delete those lines: without them
the existing database cannot be opened, and Cashier stops instead of replacing them.

From the repository root, run:

```powershell
pnpm dev:desktop
```

Tauri starts the existing Next.js development server on port 3000, compiles the
desktop shell, and opens the Cashier window. The first Rust compilation downloads
dependencies and takes longer than subsequent runs. Start with port 3000 free;
if you already have a web development server running, stop it in its terminal
before running this command.

Turbo prepares the backend before Tauri starts; no separate
`pnpm dev:api` or worker command is needed. The native desktop supplies its API
address to the frontend. Ordinary web deployment still uses `NEXT_PUBLIC_API_URL`.

The owned API automatically includes these platform origins:

```dotenv
CORS_ORIGIN=http://localhost:3000,http://tauri.localhost,https://tauri.localhost,tauri://localhost
```

Restart the desktop app after changing its settings. Tauri shells use Bearer
authentication because packaged origins cannot rely on the API's browser cookie.
Ordinary web browsers continue to use cookies. This origin configuration does
not itself add builds for additional platforms.

## Build the Windows installer

```powershell
pnpm build:desktop
```

This builds the shared package, API, Node bundle, and Next.js static export, then
packages them with Tauri. Turbo runs the prerequisites in order. The installer is under
`apps/desktop/src-tauri/target/release/bundle/nsis`.
The installed app needs no separate MySQL, API, system Node, or pnpm. First builds download tools, dependencies, and the cached Node license;
installed local operations do not depend on those downloads.

Preparation also bundles MySQL 8.4 LTS (Windows x64 only). The first run downloads the
official ZIP (~270 MB) into `apps/desktop/.cache/mysql`, refuses it unless its size and
SHA-256 match the pin in `scripts/mysql.mjs`, and keeps only `mysqld`, `mysqladmin`,
`mysqldump`, `mysql`, their libraries, `share/` and the license under
`src-tauri/runtime/mysql`. The Visual C++ runtime DLLs are copied next to them from
the Visual Studio C++ build tools (already required by Rust). Later runs reuse both.
The app starts this MySQL on a free `127.0.0.1` port, gives the API its address
through the environment (never the command line), and shuts it down gracefully
after the API on close. A `DATABASE_URL` left in `settings.env` is ignored and
logged once.

## Release versions

Rebuilding reproduces the current version. Bump it explicitly for a new release:

```powershell
pnpm version:desktop patch
pnpm build:desktop
```

`patch`, `minor`, and `major` update the desktop package, Tauri config, Cargo
manifest, and desktop Cargo.lock entry together. Starting from `0.2.0`, these
produce `0.2.1`, `0.3.0`, and `1.0.0`, respectively.

## Settings and troubleshooting

Startup rejects a database that does not
match the packaged migration checkpoint. `ADMIN_USERNAME` / `ADMIN_PASSWORD`
configure the super-admin; `JWT_SECRET` needs at least 32 characters.

`BRANCH_ID` is required and must match the database's sole branch. Existing
`settings.env` files are preserved by the import command, so installations made
before this setting was added need it entered manually in that file. Restart
the app afterward. Do not use a counter such as `1`, or generate an arbitrary
UUID that has no matching branch row.

Login requires choosing **Admin** or **Cashier**. Matching usernames across those
roles are allowed; cashier usernames may also repeat in different branches.
The super-admin can enter the local branch; another admin needs a current
`admin_branches` assignment. The local API rejects other-branch requests even
from the super-admin. Branch management writes on the PC are blocked.
Removing an assignment blocks an existing local session, and a rejected session
refresh returns the UI to login. Archived branches block cashier login/sessions
and writes while admins retain read-only history. External refreshes skip archived
branches and stay pinned to the configured branch.

`DESKTOP_SYNC_ENABLED=false` disables external syncing entirely and needs no
external credentials. Otherwise configure `EXTERNAL_ORDERS_*`.
`EXTERNAL_CATALOG_ENABLED=false` keeps a local menu while still syncing online
orders. Failed internet requests do not block local API startup or checkout.

Startup errors appear in a native dialog. Logs are at
`C:\ProgramData\Cashier\backend.log` (API) and `C:\ProgramData\Cashier\mysqld.log`
(database).

## Desktop checks

The bundled runtime smoke test creates a fresh owned scratch database, applies
the repository baseline, supplies one test branch, and verifies offline startup,
explicit-role login, branch pinning and shutdown. It drops only that scratch DB;
the configured `.env.test` database is not reset by the smoke test.

Run these commands from the repository root:

| Command                                 | Check                                                   |
| --------------------------------------- | ------------------------------------------------------- |
| `pnpm typecheck:desktop`                | Cargo checks all Rust targets                           |
| `pnpm lint:desktop`                     | Rust formatting and Clippy, treating warnings as errors |
| `pnpm test:desktop`                     | Settings, version, MySQL bundle and lifecycle tests     |
| `pnpm smoke:desktop`                    | Bundled runtime outside the repo with internet disabled |
| `pnpm --filter @cashier/desktop format` | Format Rust code                                        |

The desktop checks run through Turbo sequentially and use Cargo's incremental
compilation cache. The root `pnpm lint` and `pnpm typecheck` commands also include
the desktop's script/Rust checks. Existing web checks cover the reused UI.
The smoke test only uses the local `*_test` database from `.env.test`; it applies
its migrations, checks all origins and login, and verifies shutdown.

The desktop installer retains its dedicated `build:desktop` task so the existing
web/API `build` and `dev` workflows do not also launch or package Tauri.
