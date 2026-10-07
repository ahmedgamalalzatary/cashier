# Desktop + Online Backup Plan

Hand-off plan for turning Cashier into an **offline-first desktop app per branch** that
backs up everything to a **read-only online reports site**. Written 2026-10-07 from the
owner's decisions and a code survey at commit `3ce6aa3`.

Use the **Tracker** (section 3) to mark progress. Update this file in the same change that
finishes a slice.

---

## 0. Rules for implementers (read first)

- Follow `AGENTS.md` exactly: no commits unless asked, no sub-agents unless allowed, TDD,
  sequential commands, plain-language reports, notify the owner of any bug you notice.
- Work **phase by phase, slice by slice**. A slice is done when its targeted checks are
  green and its acceptance line passes. A phase is done when all its slices are done.
  At the end of every phase that touches several apps, run the full suite
  (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus `pnpm test:desktop`
  when the desktop is touched).
- Phases are ordered so **infrastructure comes first**. Do not start a phase before the
  previous one is done unless the tracker says the phases are independent.
- New migrations: edit the schema, then `db:generate`. Never hand-edit an applied migration
  (the only exception is the one-time baseline reset in Phase 4, allowed because the
  system is in beta with demo data only).
- Update `docs/system-specs.md` whenever a business rule changes (shifts, logins, admins).
- Read **section 7 (Implementation contracts)** before coding any phase. It fixes table
  directions, settings, endpoints and sync table shapes.
- Do not start a phase while a question it needs is still **Open** in section 2.
- Interleaving with `docs/cleanup-plan.md` (decided 2026-10-07, Q6): its **5A (shift auto-close)
  lands before Phase 4** of this plan; its **6–9 (web restyle) land after Phase 3**, so the
  restyled screens arrive already inside `packages/web-core`.

---

## 1. Target picture

```
SHOP PC (1 branch = 1 device = 1 open shift)            VPS (Hostinger KVM1, Docker + Nginx)
┌─────────────────────────────────────────┐            ┌──────────────────────────────────┐
│ Cashier.exe (Tauri)                      │            │ online-web  (reports + admins UI) │
│  ├─ web (static Next export)             │            │ online-api  (auth, reports,       │
│  ├─ api (Node, owned child process)      │  upload    │              admins, link, ingest)│
│  │   └─ workers: external orders,        │ ─────────► │ mysql (same migrations, full copy)│
│  │      sync uploader, accounts pull     │  15 min +  │                                   │
│  ├─ mysqld (bundled, owned child)  ★TRUTH│  button    │ accounts (super-admin + admins    │
│  └─ updater (GitHub latest.json)         │ ◄───────── │   assigned to the branch)         │
└─────────────────────────────────────────┘  accounts   └──────────────────────────────────┘
                                               pull       GitHub Releases: setup.exe + latest.json
```

### Data direction (never break this)

| Data                                                                             | Created where                                                     | Flows                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| Everything a branch does (orders, shifts, stock, cashiers, employees, salaries…) | Shop PC                                                           | PC → online (upload)                                     |
| Branches, admins, admin↔branch assignments, link codes, devices                  | Online (super-admin)                                              | online → PC (accounts pull, only what that branch needs) |
| Super-admin                                                                      | `.env.production` on the VPS, re-seeded on every online-api start | online → every PC                                        |

The online database is a **backup + reports source**. Users can never change business
data online. The only online writes are admin management (Phase 8) and ingest (Phase 10).

### Login rules

```
LOCAL (shop PC, branch X)                     ONLINE
super-admin → allowed, sees branch X only     super-admin → every branch
admin       → allowed only if assigned to X   admin       → only assigned branches (1..n)
cashier     → branch X                        cashier     → rejected
```

### Update rules

```
App opens ── online? ──yes── newer version? ──yes──► forced: download → install → relaunch
   │                 └─no / timeout (5s) ───────────► start normally (works offline)
   └─ while running: check every 30 min ── newer? ──► "Update available" button (optional)
                                                       not pressed → forced on next open
Shift: lives in the database, so closing, crashing or updating never ends it.
```

---

## 2. Owner decisions (final)

| ID  | Decision                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One device per branch. One open shift per branch (replaces today's several shifts per branch).                                                              |
| D2  | Each PC stores **only its own branch**. Admins on a PC see only that branch.                                                                                |
| D3  | An admin can log in on a PC only if assigned to that PC's branch; otherwise rejected.                                                                       |
| D4  | Online: super-admin sees everything; admin sees only assigned branches; super-admin can assign one admin to many branches. Cashiers have no online access.  |
| D5  | Super-admin comes from `.env.production`, seeded on every online-api start, pushed to every PC when online.                                                 |
| D6  | Admins and branches are created/assigned **online** by super-admin; PCs download the admins assigned to their branch (incl. password changes and removals). |
| D7  | Cashiers and employees are created **locally** and uploaded like any other data.                                                                            |
| D8  | The online copy gets **everything** (all tables). Sync is one-way: PC → online. No two-way sync.                                                            |
| D9  | IDs move from counters to UUIDs (decided despite the size of the change).                                                                                   |
| D10 | Upload every 15 minutes when online + an "Upload now" button.                                                                                               |
| D11 | MySQL is **bundled** inside the installer. The `.exe` alone must be enough.                                                                                 |
| D12 | First launch must be online once to link the PC to its branch with a one-time code.                                                                         |
| D13 | Accepted risk: an admin removed online can still log in on an offline PC until it reconnects.                                                               |
| D14 | Updates: forced on app open; optional button while running; offline → app works.                                                                            |
| D15 | Beta, demo data only: databases may be wiped and migrations reset. No data migration needed.                                                                |
| D16 | Deploy order for releases that change the database: **VPS first, then desktop release**.                                                                    |
| D17 | The uploader runs **on the PC** inside the desktop runtime next to the external-orders worker. No separate `apps/worker`.                                   |
| D18 | Code-signing certificate (Windows "unknown publisher" warning) is handled by the owner later. Out of scope.                                                 |

### Proposed technical decisions (implementer may change only with owner approval)

| ID  | Decision                                                                                                                                                                     | Why                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T1  | UUID **v7**, generated in the app, stored as `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`.                                                                               | v7 is time-ordered (good for MySQL indexes); text is easy to debug; data is small.                     |
| T2  | Change capture with **MySQL triggers** writing to a `sync_outbox` table, generated by a script from the schema.                                                              | Catches every write, including raw SQL, so no module can forget to sync.                               |
| T3  | Ingest applies each batch in one transaction, in outbox order, with `FOREIGN_KEY_CHECKS=0` for that session only.                                                            | The PC already enforced foreign keys; outbox order is commit order; avoids parent/child ordering bugs. |
| T4  | Rows that came **from** online (accounts pull) and rows written **by** ingest must not create outbox entries: triggers skip when session variable `@cashier_sync_apply = 1`. | Stops echo loops.                                                                                      |
| T5  | Updater uses `tauri-plugin-updater`; release built by GitHub Actions `tauri-action` on tag `desktop-v*`.                                                                     | Official path; uploads `latest.json` automatically (`uploadUpdaterJson: true` default).                |
| T6  | Desktop owns `mysqld` exactly like it owns Node today (Windows Job object, graceful shutdown with `mysqladmin shutdown`).                                                    | Same proven lifecycle code in `apps/desktop/src-tauri/src/backend.rs`.                                 |

### Owner answers to the open questions

| ID  | Question                                                                                                                                                                             | Answer                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Username clashes: a local cashier "ali" (offline) vs an online admin "ali".                                                                                                          | Same username is allowed. The login screen has an **Admin / Cashier** choice, so no password rule is needed (see Q5).                                                           |
| Q2  | Does the VPS stop running the old cashier (`api`, `web`, `cache-worker`)?                                                                                                            | Yes. The VPS only runs `mysql`, `migrate`, `online-api`, `online-web`.                                                                                                          |
| Q3  | External online orders (`EXTERNAL_ORDERS_*`): one account or one per branch?                                                                                                         | One account for all branches. Same `EXTERNAL_ORDERS_*` values on every PC.                                                                                                      |
| Q4  | MySQL is GPL. Is bundling it OK?                                                                                                                                                     | Yes, owner accepts.                                                                                                                                                             |
| Q5  | Owner proposed "same username, password must differ". That leaks passwords: a branch admin who gets "password already used" when creating cashier "ali" learns admin ali's password. | **Answered 2026-10-07:** same username allowed; login screen has an **Admin / Cashier** choice. No password rule. Needed by Phase 4.                                            |
| Q6  | `docs/cleanup-plan.md` phases 5A (shift auto-close), 6, 7, 8, 9 have no matching commits yet. Finish them before Phase 1 here, or after Phase 11?                                    | **Answered 2026-10-07:** finish 5A before Phase 4 (it changes shift rules that Phase 4 also changes); 6–9 (web restyle) after Phase 3 so they land in the shared packages once. |
| Q7  | `seed-admin.ts` bumps the super-admin `tokenVersion` on **every** start, so every online-api restart logs the super-admin out online and (after the next accounts pull) on every PC. | **Already fixed** in `eec7eed`. Boot paths (`apps/api/src/index.ts`, `desktop/runtime.ts`) call `syncConfiguredAdmin`, which revokes sessions only when the password actually changed; a name/flag/active fix keeps sessions. `seedAdmin` (unconditional bump) is only reached by the manual `db:seed` full reset. Covered by `packages/db/tests/mysql/seed-admin.test.ts`. Needed by Phase 7. |

---

## 3. Tracker

Status: ☐ todo · ◐ in progress · ☑ done. Write the date when done.

| Phase                | Slice                                                             | Status | Done on    | Notes                                                     |
| -------------------- | ----------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------- |
| 1 DB package         | 1.1 create `packages/db`, move schema/client/branch-context/seeds | ☑      | 2026-10-07 | `HttpError` moved to the package; api re-exports it       |
|                      | 1.2 move migrations + drizzle config, api uses package            | ☑      | 2026-10-07 | `db:*` scripts live in `packages/db`; api keeps `db:seed` |
|                      | 1.3 desktop prepare/smoke + Docker files use package              | ☑      | 2026-10-07 | all MySQL tests now live in `packages/db/tests/mysql`     |
| 2 Server core        | 2.1 `packages/server-core`: middleware (error, validation, auth)  | ☑      | 2026-10-07 | `branch` scoping moved too (both APIs need it)          |
|                      | 2.2 move auth module                                              | ☑      | 2026-10-07 | 4 unit tests moved with the code                        |
|                      | 2.3 move reports module                                           | ☑      | 2026-10-07 | `cairoMidnight` is shared with the shifts module        |
|                      | 2.4 move users/branches modules whole                             | ☑      | 2026-10-07 | 3 unit tests moved with the code                        |
| 3 Web core           | 3.1 `packages/web-core`: api client, auth/session, ui primitives  | ☑      | 2026-10-07 | `navigation.ts` moved too (`canOpenPath` needs `ADMIN_PATHS`) |
|                      | 3.2 move reports page/components/model/service                    | ☑      | 2026-10-07 | page body → `features/reports-page.tsx`; route is thin     |
|                      | 3.3 move login + users/branches management UI                     | ☑      | 2026-10-07 | merged with 3.2: reports needs `branch-provider`            |
| 4 Schema reset       | 4.1 UUID helper + custom column type + tests                      | ☑      | 2026-10-07 | UUIDv7 + ASCII column; isolated lint/typecheck/build and 19 unit tests green |
|                      | 4.2 schema: all ids → UUID, new tables, one shift per branch      | ☑      | 2026-10-07 | 54 tables; DB scope moved from 4.4; 26 unit + 7 MySQL tests green |
|                      | 4.3 baseline migration reset                                      | ☐      |            |                                                           |
|                      | 4.4 api modules + zod schemas + shared types → string ids         | ☐      |            |                                                           |
|                      | 4.5 web → string ids                                              | ☐      |            |                                                           |
|                      | 4.6 login rule: admin must be assigned to the branch              | ☐      |            |                                                           |
| 5 Bundled MySQL      | 5.1 fetch + trim MySQL noinstall ZIP in `prepare.mjs`             | ☐      |            |                                                           |
|                      | 5.2 Rust: init data dir, start/stop `mysqld`, health wait         | ☐      |            |                                                           |
|                      | 5.3 auto backup + auto migrate on start                           | ☐      |            |                                                           |
|                      | 5.4 installer/uninstaller keep data; smoke test on clean VM       | ☐      |            |                                                           |
| 6 Updater + releases | 6.1 signing keys + updater plugin config                          | ☐      |            |                                                           |
|                      | 6.2 forced check on open with 5s fallback                         | ☐      |            |                                                           |
|                      | 6.3 optional mid-session update button                            | ☐      |            |                                                           |
|                      | 6.4 GitHub Actions release workflow                               | ☐      |            |                                                           |
| 7 Online apps + VPS  | 7.1 `apps/online-api` (auth, reports, scoping)                    | ☐      |            |                                                           |
|                      | 7.2 `apps/online-web` (login + reports)                           | ☐      |            |                                                           |
|                      | 7.3 Docker compose + Nginx + runbook                              | ☐      |            |                                                           |
| 8 Admin management   | 8.1 branches CRUD (super-admin)                                   | ☐      |            |                                                           |
|                      | 8.2 admins CRUD + multi-branch assignment                         | ☐      |            |                                                           |
|                      | 8.3 device link codes                                             | ☐      |            |                                                           |
| 9 Link + accounts    | 9.1 online `POST /device/link`, device token                      | ☐      |            |                                                           |
|                      | 9.2 desktop first-launch link screen                              | ☐      |            |                                                           |
|                      | 9.3 accounts pull (on start + every 15 min)                       | ☐      |            |                                                           |
| 10 Upload sync       | 10.1 outbox table + trigger generator + tests                     | ☐      |            |                                                           |
|                      | 10.2 online ingest endpoint (idempotent)                          | ☐      |            |                                                           |
|                      | 10.3 PC uploader worker (15 min) + "Upload now" + status          | ☐      |            |                                                           |
|                      | 10.4 full resend tool (recovery)                                  | ☐      |            |                                                           |
| 11 Release v1        | 11.1 end-to-end: 2 PCs → online, offline/online cycles            | ☐      |            |                                                           |
|                      | 11.2 docs + runbooks + system-specs                               | ☐      |            |                                                           |

---

## 4. Phases

### Phase 1: `packages/db` (infra, no behavior change)

**Why first:** both `apps/api` and `apps/online-api` must use the _same_ schema and migrations.

**Move**

- `apps/api/src/db/{schema.ts,index.ts,branch-context.ts,seed*.ts}` → `packages/db/src/`
- `apps/api/drizzle/` + `drizzle.config.ts` → `packages/db/`
- `HttpError` used by `branch-context.ts` → keep the dependency minimal (pass an error factory
  or move `HttpError` into `packages/db` / `packages/server-core`; avoid a package cycle).

**Update every integration point**

- `apps/api` imports, `package.json` scripts (`db:*` move to `packages/db`), `tsconfig` refs.
- `apps/api/src/desktop/runtime.ts` (migration checkpoint reads `__drizzle_migrations`).
- `apps/desktop/scripts/prepare.mjs` + `smoke.mjs` (they bundle/apply migrations).
- `dockerfile.api` `migrate` target, `turbo.json`, `.dockerignore`, `README.md`, `docs/docker.md`.
- Tests under `apps/api/tests/db`, `tests/database` and the mysql vitest config.

**Acceptance:** `pnpm build:desktop` + `pnpm smoke:desktop` + api tests are green; nothing else changed.

### Phase 2: `packages/server-core` (infra, no behavior change)

Move the parts both APIs need, as Express module factories (same shape as today's
`createXModule(db)`):

- `apps/api/src/middleware/{error,validation,auth}.ts` — plus `branch.ts`: branch scoping is
  middleware the online API needs too, so it moves with the rest.
- `apps/api/src/modules/auth/*`, `modules/reports/*`
- `modules/branches/*` and `modules/users/*`, **whole** (owner decision: no splitting).
  `users` create/update is already super-admin only and admin-only; `branches` is one small
  module. Each app chooses what it mounts; PC-only restrictions (section 7.6) come in Phases 4.6/9.

`apps/api/src/app.ts` keeps mounting them at the same paths. Tests move with the code.

**Acceptance:** existing API tests pass unchanged (only import paths differ).

### Phase 3: `packages/web-core` (infra, no behavior change)

Move to a React package consumed by both Next apps:

- `apps/web/src/lib/{api,auth,branch-session,format,cairo-date,cn}.ts` — plus `navigation.ts`
  and `search.ts`: `canOpenPath` reads `ADMIN_PATHS` from navigation, and `search-select`
  reads `matchesQuery`, so splitting either file would duplicate shared logic.
- `components/ui`, `components/reports`, `models/reports-model.ts`, `services/reports-service.ts`,
  the body of `app/reports/page.tsx` (703 lines; keep the route file thin)
- `app/login`, `components/auth`, `components/users`, `components/branches`, their services/models.
  3.2 and 3.3 were done together: the reports page reads `useBranch`, which needs the branch
  provider, which needs the auth provider.

Route files (`app/*/page.tsx`) stay as thin wrappers that render a component from
`packages/web-core/src/features`. The package ships TypeScript source, has no build step, and
is listed in `transpilePackages`. Imports inside the package are relative: a `@/` alias would
resolve against the *consuming* app and silently point at the wrong directory.

**Trap:** Next must transpile the package (`transpilePackages`). Desktop is a static export
(`output: "export"`), so moved code must stay client-only (no server actions, no route handlers).

**Acceptance:** web tests + `pnpm build:desktop` + manual check of reports and login.

### Phase 4: Schema reset (largest phase, touches everything)

**Completed shift prerequisites (2026-10-07):** cashier writes now close expired shifts
before their business transaction; the desktop runs its 60-second auto-close worker
independently of external-order synchronization and stops it with the owned API.
Verified against the committed baseline plus only these fixes: API lint/typecheck/build,
411 API unit tests, and all 39 shift/desktop MySQL tests passed. The regression tests
first failed without the fixes. UUID/schema/login changes are not part of this patch.

**Completed Docker prerequisite (2026-10-07):** `dockerfile.web` now copies
`packages/web-core/package.json` into dependency installation and the package source
into the build stage. An isolated context matching the old COPY inputs failed with
unresolved web-core imports; adding these inputs produced a green standalone build.
No UUID/schema/login changes were included in this verification.

**4.1 UUID.** Add `uuidv7()` in `packages/db` and a Drizzle column helper `id()` =
`char(36)` ascii_bin with `$defaultFn(uuidv7)`. Unit-test ordering and format.

**4.2 Schema** (`packages/db/src/schema.ts`, 54 tables after adding five):

**Slice dependency adjustment approved by the owner (2026-10-07):** the UUID conversion
of `packages/db/src/branch-context.ts` moves from 4.4 into 4.2. The schema does not
typecheck with numeric branch context. This includes removing the implicit branch `1`
fallback and requiring explicit UUID scope. The remaining API, web and login work stays
in its original slices. `branchColumn().default(1)` is removed with the UUID schema.

**Username decision confirmed 2026-10-07:** cashier usernames are unique within each
branch; separate branches may each have a cashier named `ali`. Admin usernames are
unique globally. Admin and cashier accounts may share a username. The functional admin
index enforces uniqueness despite nullable admin `branch_id`, without generated sync columns.

Verification uses `pnpm --filter @cashier/db test:schema`: generate SQL into a temporary
directory, install it in a newly created local `cashier_schema42_<pid>_test` database,
exercise the schema, and remove only that owned scratch database. Existing databases,
repository migrations and desktop migration checkpoints are left for 4.3.



- Every `int().autoincrement()` id and every FK column → UUID. Keep the existing
  `(branch_id, id)` unique indexes and composite FKs.
- `users`: `branch_id` nullable for admins; `username` uniqueness per Q1/Q5.
- New `admin_branches(admin_user_id, branch_id)`.
- New `devices(id, branch_id, token_hash, linked_at, last_seen_at, app_version, last_upload_at)`.
- New `link_codes(code_hash, branch_id, expires_at, used_at)`.
- New `sync_outbox` and `sync_state` (Phase 10 fills them; create now so the baseline is complete).
- Shifts: replace `shifts_open_slot_uidx (cashier_user_id, open_slot)` with one open shift
  per **branch**. Update shift open/close/auto-close logic and its tests.

**4.2 completed 2026-10-07:** isolated DB lint/typecheck/build, 26 unit tests and seven
fresh-MySQL tests passed. Verification covers UUID/FK storage, usernames, concurrent
branch shift opening, releasing/reopening slots, archived-branch write protection,
external numeric IDs and the new account/link/backup tables. Explicit short names fix
MySQL's primary-key identifier limit on ingredient mappings. No repository migration
reset, existing-database wipe, API/web/login completion or desktop checkpoint change
is included in this slice.

**4.3 Baseline reset.** Delete `drizzle/0000…0045` + meta, generate a fresh `0000_baseline`.
Wipe dev, test and VPS databases (D15). Update the desktop migration checkpoint.

**4.4 API.** Every zod `z.coerce.number()` id param/body → `z.string().uuid()`; route params;
`X-Branch-Id` validation in `middleware/branch.ts` (regex is `^[1-9]\d*$` today);
The DB-side explicit UUID scope and removal of `branchColumn().default(1)` land in 4.2
(owner-approved dependency adjustment above). The PC's branch comes from its settings/link;
online always uses an explicit branch.
`packages/shared/src/types.ts` id types → `string`.

**4.5 Web.** Number parsing of ids (`Number(id)`, `parseInt`) → strings; `branch-session.ts`.

**4.6 Login rule (D3).** Today `selectBranch` only restricts cashiers; any admin can open any
branch. New rule: on the PC, login is allowed only for super-admin, admins assigned to the
PC's branch, and that branch's cashiers. All requests are pinned to the PC's branch.

**Traps**

- Search the whole repo for `Number(`, `parseInt`, `.coerce.number`, `autoincrement`,
  `insertId` (MySQL `insertId` is meaningless with UUIDs; set the id before insert and return it).
- Sorting by id for "latest" must become sorting by `created_at` or UUIDv7 order.
- Seeds (`seed.ts`, `seed-admin.ts`) and the test helpers create rows with numeric ids.

**Acceptance:** full suite green; desktop smoke green on a fresh database.

### Phase 5: Bundled MySQL (desktop)

- `prepare.mjs`: download the official **MySQL 8.4 LTS Windows noinstall ZIP** (pin version +
  SHA-256), keep only `bin/mysqld.exe`, `bin/mysqladmin.exe`, `bin/mysqldump.exe`, required DLLs and
  `share/`. Cache it like the Node binary. Add the license file.
- Rust (`backend.rs` pattern): data dir `%LOCALAPPDATA%\com.cashier.desktop\mysql`;
  first start → `mysqld --initialize-insecure`, then create user + random password saved in
  `settings.env`; every start → `mysqld` on loopback, a free port, `--skip-name-resolve`;
  wait until it is ready; then start Node with the derived `DATABASE_URL`.
- Shutdown order: Node first, then `mysqladmin shutdown` (graceful), then the Job object kills
  anything left.
- On start, before migrations: `mysqldump` to `…\backups\<version>-<time>.sql` (keep the last 5),
  then apply migrations automatically. Replaces today's "migrations do not match" refusal
  (`apps/api/src/desktop/runtime.ts:22-31`), which stays only for a database **newer** than the app.
- `pnpm configure:desktop` and `settings.example.env` lose `DATABASE_URL` (now automatic).

**Traps**

- MySQL needs the **Microsoft Visual C++ Redistributable**. Bundle the redistributable in
  the NSIS installer or verify the DLLs ship in the ZIP; test on a clean Windows VM.
- Never put the data dir under `Program Files` (not writable, removed on uninstall).
- The NSIS uninstaller must not delete `%LOCALAPPDATA%\com.cashier.desktop`.
- Port collisions with a user's own MySQL on 3306: always use a free loopback port.
- Installer size grows (~100–200 MB after trimming). Measure it.

**Acceptance:** fresh Windows VM, install only `setup.exe`, app opens, sells, survives
close/reopen with an open shift, survives killing the process from Task Manager.

### Phase 6: Updater + release pipeline

- Generate signing keys: `pnpm tauri signer generate -w ~/.tauri/cashier.key`. Public key in
  `tauri.conf.json`; private key + password as GitHub secrets
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. **Losing the private key
  means installed apps can never update again.** Store a backup offline.
- `tauri.conf.json`: `bundle.createUpdaterArtifacts: true`;
  `plugins.updater.endpoints: ["https://github.com/ahmedgamalalzatary/cashier/releases/latest/download/latest.json"]`;
  `plugins.updater.windows.installMode: "passive"`. (Repo is public, so no token is needed.)
- Rust `lib.rs`: on open, before starting the backend, `updater.check()` with a 5 s timeout.
  Update found → show a progress window → `download_and_install` → `restart`.
  Error/timeout/offline → continue normal start and log it.
- While running: check every 30 min; if newer, tell the web layer (Tauri event) to show an
  "Update available" button. Pressing it: stop Node gracefully, stop MySQL gracefully,
  install, relaunch. The open shift is in the database, so it continues.
- `.github/workflows/desktop-release.yml`: on tag `desktop-v*`, `windows-latest`, pnpm + Rust
  cache, `pnpm build` prerequisites, `tauri-apps/tauri-action` with `tagName: desktop-v__VERSION__`,
  `permissions: contents: write`. Check: tag version == `apps/desktop/package.json` version.

**Cutting a release**

```powershell
pnpm version:desktop patch           # bumps all 4 version files together
# commit, then:
git tag desktop-v0.2.2; git push --follow-tags   # CI builds, signs, publishes setup.exe + latest.json
```

**Traps**

- An update that adds a migration must be deployed to the VPS **first** (D16).
- A release that is a draft is invisible to `releases/latest`. Publish it.
- Never ship a version lower than the installed one; the updater ignores it.

**Acceptance:** install vX, publish vX+1, reopen app → forced update; open app, publish
vX+2 → button appears; offline → app opens with no delay beyond 5 s.

### Phase 7: Online apps + VPS

- `apps/online-api`: Express using `packages/db` + `packages/server-core`. Mounts auth,
  reports, (Phase 8) admin management, (Phase 9) device link + accounts, (Phase 10) ingest.
  No business write modules. Super-admin seeded from env on every start (reuse `seed-admin.ts`).
  Branch scoping: super-admin → any branch; admin → only `admin_branches`; cashier → 401.
- `apps/online-web`: Next.js standalone using `packages/web-core`: login, branch picker
  (limited to allowed branches), reports, admins page.
- `docker-compose.yml`: services `mysql`, `migrate`, `online-api`, `online-web` (per Q2).
  New Dockerfiles `dockerfile.online-api`, `dockerfile.online-web`. Nginx: site → online-web,
  `/api` → online-api, raise `client_max_body_size` for uploads.
- Fix `docs/docker.md` (still says `/opt/minikoshk` / "MiniKoshk"; the live folder is `cashier`).

**Acceptance:** VPS shows reports for seeded demo data; an admin sees only assigned branches.

### Phase 8: Admin management (online only)

- Super-admin only: create/rename/archive branches; create/edit/deactivate admins; set their
  password; assign one admin to many branches; generate a one-time link code per branch
  (shown once, expires in 24 h, stored hashed).
- Rules from the earlier plan stay: super-admin is read-only in the UI (comes from env).

**Acceptance:** API tests for every permission edge (admin cannot manage admins, etc.).

### Phase 9: Device link + accounts pull

- Online `POST /api/device/link {code}` → validates code, marks it used, creates `devices`
  row, returns `{ branch, deviceToken }`. Re-linking a branch revokes the old device (D1).
- Desktop first launch (no link in settings): show "Link this PC" screen; requires internet
  (D12). Save `DEVICE_TOKEN` + branch id in `settings.env`; insert the branch row locally.
- Accounts pull `GET /api/device/accounts` (device token): super-admin + admins assigned to
  the branch + `admin_branches` rows for this branch + branch row. Apply in one transaction with
  `@cashier_sync_apply = 1`; deactivate local admins that are no longer returned (D6, D13).
  Runs on start (if online) and every 15 min.

**Traps:** never download password **plaintext**; the bcrypt hash is what is copied.
Revoked device token → uploader stops and shows "This PC was unlinked".

### Phase 10: Upload sync

```
local write ─trigger─► sync_outbox(seq, table, pk, op, row_json)
uploader (15 min / button) ─► POST /api/device/ingest {fromSeq, rows[]} (gzip, ≤ 2 MB)
online: one transaction, @cashier_sync_apply=1, FK checks off, upsert/delete in seq order
        ─► returns lastSeq ─► PC deletes outbox rows ≤ lastSeq, saves sync_state
```

- `packages/db/scripts/generate-sync-triggers.ts` builds INSERT/UPDATE/DELETE triggers for every
  business table from the schema and writes them into a migration. A test fails if any table
  lacks triggers (so new tables can't be forgotten).
- Ingest is **idempotent** (same batch twice = same result) and rejects rows whose `branch_id`
  isn't the device's branch.
- Server stores `devices.last_upload_at`; online-web shows "last backup" per branch.
- Desktop UI: "Upload now" button + last success time + pending count. Failures never block selling.
- 10.4: "resend everything" admin tool on the PC (rebuild outbox from all rows) for recovery.

**Traps**

- Triggers + binary logging: MySQL may refuse `CREATE TRIGGER` for a non-SUPER user unless
  `log_bin_trust_function_creators=1`. Verify early on both the bundled MySQL and `mysql:8.4` in
  Docker; set the flag in the bundled config and in `docker-compose.yml` if needed.
- `ON DUPLICATE KEY UPDATE` must cover every column; generate it, don't hand-write it.
- Keep `FOREIGN_KEY_CHECKS=0` scoped to the ingest connection, and reset it in `finally`.
- Schema version: each batch carries the PC's migration checkpoint; online rejects a batch
  from a **newer** schema (D16 prevents it) and accepts the current and previous one.

**Acceptance:** PC offline for a day, sells, reconnects → online reports match local reports exactly.

### Phase 11: Release v1

- End-to-end script: 2 linked PCs (or 2 data dirs) + local online stack; offline/online cycles,
  forced update, upload button, admin removal propagation.
- Update `README.md`, `apps/desktop/README.md`, `docs/docker.md`, `docs/system-specs.md`.
- Full suite green.

---

## 5. Guides

**Release order when a change touches the database**

```
1. merge  →  2. deploy VPS (migrate runs)  →  3. tag desktop-vX.Y.Z  →  4. PCs update on next open
```

**Install a new branch**

```
online: super-admin creates branch → assigns admins → generates link code
PC:     run setup.exe → "Link this PC" → enter code (needs internet once) → log in → open shift
```

## 6. Things to avoid

- Two-way sync of business data. Only accounts flow down.
- Editing business data online (no write endpoints other than admins, link, ingest).
- Any code path that assumes branch `1` or numeric ids after Phase 4.
- Blocking startup or selling on network calls (update check ≤ 5 s, uploads in background).
- Losing the updater signing private key.
- Running desktop build, smoke, and tests in parallel (they share ports, Cargo and MySQL).
- Starting a phase that needs an **Open** answer in section 2. Ask the owner first.

---

## 7. Implementation contracts

These are fixed shapes. An implementer follows them as written; changing one needs owner approval
and an update here.

### 7.1 Every table and its sync direction

Tables after 4.2 (54, in `schema.ts` order). "Up" = PC → online by upload. "Down" = online → PC by
accounts pull. "None" = never leaves its database.

| Direction     | Tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Up            | `employees`, `salary_advances`, `salary_adjustments`, `salary_payments`, `categories`, `suppliers`, `purchase_invoices`, `supplier_payments`, `items`, `purchase_lines`, `stock_batches`, `stocktakes`, `stocktake_lines`, `transfer_requests`, `transfer_request_lines`, `transfers`, `transfer_lines`, `recipes`, `recipe_sizes`, `recipe_ingredients`, `external_categories`, `external_products`, `external_product_sizes`, `external_modifier_groups`, `external_modifier_options`, `external_product_ingredients`, `external_size_ingredients`, `external_modifier_ingredients`, `external_orders_cache`, `preparations`, `preparation_allocations`, `shifts`, `shift_events`, `orders`, `order_lines`, `order_line_modifiers`, `refunds`, `refund_lines`, `stock_movements`, `stock_deficit_allocations`, `order_line_allocations`, `refund_line_allocations`, `waste_entries`, `waste_allocations`, `expense_categories`, `expenses` |
| Up (filtered) | `users` rows with `role = 'cashier'` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Down          | `branches` (the PC's own row), `users` rows with `role = 'admin'` (super-admin + admins assigned to the branch), `admin_branches` rows for the branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| None          | `external_catalog_sync` (local worker bookkeeping), `sync_outbox`, `sync_state`, `devices`, `link_codes`, `__drizzle_migrations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Rules:

- A new table must be added to this list in the same change. The trigger generator (Phase 10)
  reads this list and a test fails if a schema table is missing from it.
- Primary keys are **not all `id`**. The `external_*` tables use `(branch_id, external_id)` and
  `external_catalog_sync` uses `(branch_id, id)`. External ids come from the external system and
  stay as they are (no UUID). The generator must read each table's primary key from Drizzle
  (`getTableConfig`) and support composite keys.
- Cashier login data (`users` cashier rows, password hash included) goes up so online has a full
  backup, but online login rejects `role = 'cashier'`.

### 7.2 PC settings (`%APPDATA%\com.cashier.desktop\settings.env`)

| Key                                  | Phase        | Source                                                                                                                                                    |
| ------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | removed in 5 | built by the app from the bundled MySQL (`MYSQL_PORT` chosen per start, `MYSQL_PASSWORD` generated once)                                                  |
| `MYSQL_PASSWORD`                     | added in 5   | random, written on first start                                                                                                                            |
| `JWT_SECRET`                         | changed in 5 | random 48 bytes, written on first start if missing                                                                                                        |
| `ADMIN_NAME/USERNAME/PASSWORD`       | removed in 9 | the super-admin now arrives by accounts pull. `desktop/settings.ts` stops calling `getAdminSeedConfig`, and the desktop runtime stops calling `seedAdmin` |
| `ONLINE_API_URL`                     | added in 9   | baked into the build (`https://<vps-domain>/api`), may be overridden in the file                                                                          |
| `DEVICE_TOKEN`, `BRANCH_ID`          | added in 9   | written by the link screen                                                                                                                                |
| `DESKTOP_SYNC_ENABLED`, `EXTERNAL_*` | unchanged    | means **external orders/catalog** sync only, not backup upload. Same values on every PC (Q3)                                                              |

`pnpm configure:desktop` and `settings.example.env` must follow every change in this table.

### 7.3 Online API settings (`.env.production` on the VPS)

`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN` (the online-web origin), `TRUST_PROXY=true`,
`ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. **No** `EXTERNAL_*` (the online side never talks
to the external system). Today's `parseRuntimeEnv` in `apps/api/src/env.ts` requires `EXTERNAL_*`,
so online-api gets its own env schema that shares the common fields.

### 7.4 Device endpoints (online-api)

Device auth header: `Authorization: Device <token>`. Token = 32 random bytes, base64url, shown
to the PC once; online stores only its SHA-256 in `devices.token_hash`. Revoked or unknown → `401`.

| Endpoint                   | Request                                                                                                        | Success                                                                                                                                             | Errors                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/device/link`    | `{ code }`                                                                                                     | `{ deviceToken, branch: { id, name } }`                                                                                                             | `400` invalid/expired/used code                                                      |
| `GET /api/device/accounts` | —                                                                                                              | `{ branch, users: [{ id, name, username, passwordHash, role, isSuperAdmin, isActive, tokenVersion }], adminBranches: [{ adminUserId, branchId }] }` | `401`                                                                                |
| `POST /api/device/ingest`  | `{ appVersion, migrationCheckpoint, rows: [{ seq, table, op: "upsert" \| "delete", pk, row }] }`, gzip, ≤ 2 MB | `{ lastSeq }`                                                                                                                                       | `401`, `409` newer schema than server, `422` row from another branch / unknown table |

Link code: 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no look-alikes), stored as SHA-256,
valid 24 h, single use. Linking a branch that already has a device revokes the old device (D1).
Every call updates `devices.last_seen_at` and `app_version`; ingest also updates `last_upload_at`.

### 7.5 Sync tables

```
sync_outbox  seq BIGINT AUTO_INCREMENT PK   -- local order only; never sent as a business id
             table_name VARCHAR(64), op ENUM('upsert','delete'),
             pk JSON, row_json JSON NULL, created_at TIMESTAMP(3)
sync_state   id TINYINT PK (always 1), last_uploaded_seq BIGINT, last_success_at, last_error, last_attempt_at
```

Triggers: `AFTER INSERT` / `AFTER UPDATE` → `upsert` with `JSON_OBJECT` of every column of `NEW`;
`AFTER DELETE` → `delete` with the key of `OLD`. Every trigger starts with
`IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN … END IF`.
Uploader: read up to 500 rows after `last_uploaded_seq`, send, on success store `lastSeq` and delete
sent outbox rows, repeat until empty. One upload at a time (in-process lock). Timer 15 min +
`POST /api/sync/upload-now` (local API, admin only) for the button.

### 7.6 Screen changes

PC (`apps/web`):

- Remove the branch switcher (`components/branches/workspace-bar.tsx`) and the branches page;
  every request uses the linked branch.
- Users page manages **cashiers only**. Admins are read-only there and say "managed online".
- Login: Admin / Cashier choice (Q5).
- New: "Link this PC" screen (before login, when not linked); "Update available" button in the
  header (Phase 6); backup status card for admins: last upload time, pending count, "Upload now".

Online (`apps/online-web`): login (admins only), branch picker limited to allowed branches,
reports (shared), admins page + branches page + link code generation + devices/last backup
(super-admin only).

### 7.7 Tests and commands

| Area | Command | Where tests live |
| --- | --- | --- |
| DB package (after Phase 1) | `pnpm --filter @cashier/db test` (DB unit + DB MySQL tests), `pnpm --filter @cashier/db db:generate` | `packages/db/tests/**` |
| API | `pnpm --filter @cashier/api test` (API unit + API-facing MySQL tests) | `apps/api/tests/**` and the 24 API-facing files in `packages/db/tests/mysql` |
| Server core (after Phase 2) | `pnpm --filter @cashier/server-core test` | `packages/server-core/tests/**` |
| Online API | `pnpm --filter @cashier/online-api test` | `apps/online-api/tests/**` |
| Web / online-web | `pnpm --filter @cashier/web test`, `pnpm --filter @cashier/online-web test` | `*/tests/**` |
| Desktop | `pnpm test:desktop`, `pnpm lint:desktop`, `pnpm typecheck:desktop`, `pnpm smoke:desktop` | `apps/desktop/tests`, Rust `#[cfg(test)]` |

All MySQL test files stay in `packages/db/tests/mysql`. DB's `vitest.mysql.config.ts`
runs `seed-admin.test.ts` and `timezone.test.ts`; `vitest.api-mysql.config.ts` runs
all the other files, which exercise API behavior. API's `test:mysql` delegates to
DB's `test:mysql:api` through Turbo, so filtered API testing includes this coverage.
For API unit tests alone, use `pnpm --filter @cashier/api test:unit` after building
`@cashier/server-core` and its dependencies.

The DB suite uses the test database configured by the root `.env.test`. The API suite
uses the same connection credentials with the database name `cashier_api_test`.
Provision that database and give the `.env.test` account access before running API
MySQL tests. Both names must satisfy the existing `test_*` or `*_test` guard;
`cashier_test_api` does not. Separate databases allow root Turbo testing to run both
suites without one suite migrating or clearing the other's tables.

`packages/db/tests/support` owns migration and cleanup fixtures, plus the shared
Express options and user fixtures. Keeping these fixtures in DB does not require
excluding API-facing tests from the API test command.

Production resolves `@cashier/db`, `@cashier/server-core`, and `@cashier/shared` to
compiled `dist`. The DB test tasks declare explicit build prerequisites in
`turbo.json`; the API `test` command also builds server-core and its dependencies,
so a filtered API run works in a clean checkout.

API and worker development scripts enable the `development` export condition.
It resolves all three packages directly to `src`, so `tsx watch` reloads moved
code when it changes. Both `pnpm dev` and direct `pnpm dev:api` use this resolution;
no initial dependency compilation or separate compilation watchers are required.

Sync tests need two databases at once:
`cashier_test` (PC) and `cashier_online_test` (online). Add the second one to `.env.test` and
`packages/db/tests/mysql-setup.ts` in Phase 10.

Each phase writes tests **first** for its acceptance line (red → green), then keeps the old
tests green. Phases 1–3 add no new behavior, so their proof is that the existing tests pass
unchanged apart from import paths.
