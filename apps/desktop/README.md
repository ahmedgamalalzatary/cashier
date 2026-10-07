# Cashier desktop

The Windows x64 installer contains the existing frontend, Express API, Node
runtime, and optional background cache worker. The app starts its own API on a
free loopback port, checks the local database, and opens the window after startup.
Closing the app stops its API; Windows also stops the owned process after an app
crash. A second launch focuses the existing window.

MySQL must already be installed locally and the database migrations applied.
MySQL provisioning, automatic database upgrades, and the online updater are
separate next steps.

## Try it on Windows

Install Microsoft C++ Build Tools with the **Desktop development with C++**
workload, Rust with the Windows MSVC toolchain, and WebView2. Restart your
terminal after installing Rust so Cargo is available on PATH.
Build tools require Node 20.11 or later; the installed app includes its own Node.

Import the development machine's existing local database and admin settings once:

```powershell
pnpm configure:desktop
```

Settings are saved at `%APPDATA%\com.cashier.desktop\settings.env` and are preserved
when this command is repeated or the app is updated. Real credentials are not
included in the installer. Edit that file to change desktop configuration;
repository `.env` changes do not overwrite it later. On another prepared machine,
create `settings.env` there using `settings.example.env` and its local credentials.

From the repository root, run:

```powershell
pnpm dev:desktop
```

Tauri starts the existing Next.js development server on port 3000, compiles the
desktop shell, and opens the Cashier window. The first Rust compilation downloads
dependencies and takes longer than subsequent runs. Start with port 3000 free;
if you already have a web development server running, stop it in its terminal
before running this command.

MySQL must be running. Turbo prepares the backend before Tauri starts; no separate
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
The installed app requires prepared local MySQL, but no separate API, system Node,
or pnpm. First builds download tools, dependencies, and the cached Node license;
installed local operations do not depend on those downloads.

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

`DATABASE_URL` must point to local MySQL. Startup rejects a database that does not
match the packaged migration checkpoint. `ADMIN_USERNAME` / `ADMIN_PASSWORD`
configure the super-admin; `JWT_SECRET` needs at least 32 characters.

`DESKTOP_SYNC_ENABLED=false` disables external syncing entirely and needs no
external credentials. Otherwise configure `EXTERNAL_ORDERS_*`.
`EXTERNAL_CATALOG_ENABLED=false` keeps a local menu while still syncing online
orders. Failed internet requests do not block local API startup or checkout.

Startup errors appear in a native dialog. Logs are at
`%APPDATA%\com.cashier.desktop\backend.log`.

## Desktop checks

Run these commands from the repository root:

| Command                                 | Check                                                   |
| --------------------------------------- | ------------------------------------------------------- |
| `pnpm typecheck:desktop`                | Cargo checks all Rust targets                           |
| `pnpm lint:desktop`                     | Rust formatting and Clippy, treating warnings as errors |
| `pnpm test:desktop`                     | Settings, version, and Rust process lifecycle tests     |
| `pnpm smoke:desktop`                    | Bundled runtime outside the repo with internet disabled |
| `pnpm --filter @cashier/desktop format` | Format Rust code                                        |

The desktop checks run through Turbo sequentially and use Cargo's incremental
compilation cache. The root `pnpm lint` and `pnpm typecheck` commands also include
the desktop's script/Rust checks. Existing web checks cover the reused UI.
The smoke test only uses the local `*_test` database from `.env.test`; it applies
its migrations, checks all origins and login, and verifies shutdown.

The desktop installer retains its dedicated `build:desktop` task so the existing
web/API `build` and `dev` workflows do not also launch or package Tauri.
