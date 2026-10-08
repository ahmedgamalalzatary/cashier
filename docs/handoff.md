# Phase 5 handoff: bundled MySQL

Prepared 2026-10-08 for the next AI working in `D:/Documents/work/cashier`.
This document replaces the old Phase 4 recovery handoff. It covers **Phase 5 only**.

## 1. Big boss file and reading order

**[Big boss: docs/desktop-online-plan.md](desktop-online-plan.md)** is the main plan
and source of truth. This handoff is a navigation and acceptance guide, not permission
to change its decisions or start additional work.

Before implementing, read:

1. [AGENTS.md](../AGENTS.md), completely.
2. [The big boss plan](desktop-online-plan.md): section 0, owner decisions in section 2,
   tracker in section 3, **Phase 5 in section 4**, and implementation contracts in section 7.
3. [System specifications](system-specs.md), especially branch/role/shift rules and the data model.
4. [Desktop README](../apps/desktop/README.md), including its currently staged changes.
5. The TDD skill at
   [SKILL.md](C:/Users/Admin/.agents/skills/test-driven-development/SKILL.md), plus
   [writing-good-tests.md](C:/Users/Admin/.agents/skills/test-driven-development/writing-good-tests.md).
6. Complete related implementation files for the authorized slice, listed below.

Consult primary MySQL documentation while implementing the relevant slice:

- [Windows installation and runtime requirements](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html).
- [Data directory initialization and securing initial accounts](https://dev.mysql.com/doc/refman/8.4/en/data-directory-initialization.html).
- [Restoring SQL-format backups](https://dev.mysql.com/doc/refman/8.4/en/reloading-sql-format-dumps.html).

**Read the working-tree plan, not just its committed version.** At this handoff the
plan has both staged and unstaged edits. The latest unstaged additions include
`mysql.exe`, credentials-before-initialization ordering and failed-upgrade recovery.
Inspect both `git diff -- docs/desktop-online-plan.md` and
`git diff --cached -- docs/desktop-online-plan.md` to understand what changed.

After compaction, reread these original instructions and documents. Do not rely
only on a conversation summary or this handoff.

## 2. Current starting point and authorization

- Phase 4 is complete. `main` and `backup-main` both point to
  `f04fbd64d1cf952d7d4972377f47ce0756d213b7` at preparation time. Recheck Git before work.
- Last full workspace verification passed all 1,141 tests, defined lint/typecheck/build
  checks, static/standalone web builds, the Windows installer build and fresh-DB desktop smoke.
  Web-core has a known non-failing Next ESLint missing-`pages` configuration notice.
  This is historical evidence, not a replacement for the next slice's baseline.
- **No Phase 5 implementation exists yet.** All four slices are todo.
- The latest request authorized rewriting this handoff only. Wait for an explicit
  implementation request before starting. The intended first implementation slice is **5.1 only**.
- Do not start 5.2, 5.3 or 5.4 merely because a helper could be written early.
  A later slice starts only when the preceding slice is finished and the owner authorizes it.
- No new commit or sub-agent permission exists. Earlier permissions are consumed.
- Existing Phase 4 stashes are recovery backups. Do not apply, pop or delete them for Phase 5.
- The owner has staged documentation changes, including the old handoff snapshot.
  Preserve that index and unrelated working changes. Rewriting this working file does not
  authorize staging or committing it; the owner needs to restage the replacement if desired.
- Preserve the owner's deletion of `docs/cleanup-plan.md`. Do not recreate it.
- No VPS action, publication, installer release or version bump is authorized by this handoff.

The owner repeatedly authorized collecting verification commands until success or
failure and explicitly said to stop asking the timed-wait question. **That override
is standing session permission for verification-result collection.** Do not ask again
when a check exceeds its first tool wait. Do not mistake a returned session ID for
completion: collect its result before launching a dependent or conflicting command.

## 3. Phase 5's actual goal

The desktop installer contains MySQL and manages its local database without requiring
the shop to install or configure a separate MySQL server.

Phase 5 provides database software, initialization, credentials, process ownership,
backup, schema migration and installer/data preservation. It does **not** implement
branch linking, account download, backup upload, online apps or the updater.

Two distinct acceptance cases must remain distinct:

| Installation                           | Required result by the end of Phase 5                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh, unconfigured production install | Bundled MySQL initializes automatically; Cashier shows a plain "This PC is not linked yet" message. No default branch or login is invented. |
| Configured developer/test install      | Test-only branch/account setup permits login, opening a shift, selling, restarting and crash recovery without losing records.               |

Real branch rows and accounts arrive through Phase 9. Its linking screen replaces
the interim unlinked message. Developer/test setup is never bundled as production seeding.

Existing separately installed MySQL databases are **left untouched**. Beta installations
start a fresh bundled database; old records are not imported. An old desktop
`DATABASE_URL` is ignored and its presence logged once, **never its credential-bearing value**.
This must be documented so an empty bundled database is not presented as an import.

## 4. One remaining plan issue before slice 5.3

The working plan says:

- Delete `upgrade-in-progress.json` only after migration succeeds.
- After restoring a failed upgrade's backup, clear that marker.
- Never retry the same failed migration on the same app version.

Clearing the only documented marker after restore removes the remembered failed
version. On reopening, ordinary pending-migration detection could retry the same
failed release. This was identified in the latest review; the plan still contains
that contradiction at handoff time.

**Recommended resolution discussed with the owner:** retain a durable state such as
`restored-awaiting-update` containing the failed app version, checkpoints and original
backup path. The same app version remains blocked after restore and restart. A corrected
release can proceed only from a verified recovered database; clear the state after
its successful migration. A newer release must not blindly migrate a half-changed DB.

Read the latest plan again before 5.3: the owner may have fixed this concurrently.
Resolve the wording with the owner rather than silently choosing between contradictory
rules. This issue does not prevent the independently authorized **5.1 packaging** work.

Required recovery test: failed migration → restore → close/reopen the same version →
still blocked → corrected version → migration succeeds. Also test interruption during restore.

## 5. Slice 5.1: fetch, verify and package MySQL

Start here only when authorized. Implement packaging, not database startup.

Read these existing integration points:

- [prepare.mjs](../apps/desktop/scripts/prepare.mjs): bundles Node/API, licenses and manifest.
- [licenses.mjs](../apps/desktop/scripts/licenses.mjs) and
  [license tests](../apps/desktop/tests/licenses.test.mjs).
- [Tauri config](../apps/desktop/src-tauri/tauri.conf.json): packaged resources/binaries.
- [Desktop package](../apps/desktop/package.json) and [Turbo tasks](../turbo.json).
- [Smoke script](../apps/desktop/scripts/smoke.mjs): current owned scratch-DB proof.

Deliverables:

- Pin an actual official MySQL **8.4 LTS Windows x64 noinstall ZIP**, its exact version,
  download URL and SHA-256. Verify official information; never invent a URL or checksum.
- Download/cache the verified artifact. Reject a mismatched or incomplete download;
  do not silently fall back to an arbitrary system MySQL or a different version.
- Retain `mysqld.exe`, `mysqladmin.exe`, `mysqldump.exe`, **`mysql.exe`**, their required
  libraries/support files and `share/`, plus the license. The client is needed for restore.
- Package only software/resources. Never include a real data directory, user settings,
  passwords, branch/account fixtures or local credentials.
- Check how Windows runtime prerequisites will be satisfied; validate the trimmed tools,
  not merely that filenames were copied. Measure the resulting package size.
- Update preparation/resource integration and focused tests. Preserve existing Node/API
  bundling and licensing behavior.

Proof must catch wrong checksum, incomplete cache/extraction, missing required files,
usable verified-cache reuse and actual packaged-tool execution. Use controlled local
fixtures for negative tests and verify the real pinned distribution as integration proof.

Do not create local databases, alter startup settings, implement restore UI or start
MySQL lifecycle work in this slice. Record what later slices will consume.

## 6. Slice 5.2: own MySQL and bootstrap safely

Read:

- [backend.rs](../apps/desktop/src-tauri/src/backend.rs) and
  [lib.rs](../apps/desktop/src-tauri/src/lib.rs): owned processes, Windows Job, app startup.
- [API desktop main](../apps/api/src/desktop/main.ts),
  [runtime](../apps/api/src/desktop/runtime.ts), [settings](../apps/api/src/desktop/settings.ts).
- [configure.mjs](../apps/desktop/scripts/configure.mjs),
  [settings example](../apps/desktop/settings.example.env),
  [configuration tests](../apps/desktop/tests/configure.test.mjs),
  [settings tests](../apps/api/tests/desktop/settings.test.ts).

Required behavior:

1. Persist generated credentials safely before initializing MySQL. Use atomic file replacement.
2. Initialize/setup in an owned staging directory beside
   `%LOCALAPPDATA%\com.cashier.desktop\mysql`, then promote it only after setup succeeds.
3. Reuse saved credentials after interrupted initialization. An existing final data dir
   with absent/corrupt credentials must stop safely; never reset it or regenerate credentials.
4. Secure or lock the initial root account before normal use. If root is locked, provide
   a separate maintenance account sufficient for the required maintenance operations.
   Limit the `cashier` application account to its own database.
5. Start the owned server on loopback and a free port; do not operate someone else's
   MySQL service. Check account host grants with `--skip-name-resolve` and prove
   authenticated readiness, not simply that a TCP port responds.
6. Derive the desktop `DATABASE_URL` internally. Remove its manual desktop setting;
   do not remove `DATABASE_URL` from ordinary development/VPS API configuration.
7. Start the API only after database readiness and the applicable migration/setup gates.
   Missing branch/accounts produces the documented unlinked state, not fabricated identities.
8. On shutdown stop Node first, shut down MySQL gracefully, then terminate remaining
   owned processes through the Job mechanism. Preserve database records and open shifts.

Credentials are random, generated once and reused. Command lines, logs, dialogs and
tests must not reveal them. Temporary options files must have real current-user-only
access on Windows; do not assume a Unix file-mode argument alone provides that protection.
Generated JWT settings must follow the big boss settings contract too.

Existing startup/shutdown deadlines were designed for Node alone. Review them against
initialization/backup/migration durations and prove bounded failure cleanup and useful
progress reporting; do not kill legitimate setup merely because an old timer expired.

Write failure-path tests first: interrupted setup, missing/corrupt credentials,
passwordless root rejection, app-user database isolation, occupied port, missing runtime
dependencies, process exit, normal close, forced termination and repeat startup.

## 7. Slice 5.3: backups, migrations and recovery

Resolve section 4's recovery-state contradiction before implementing this slice.

Read the [API desktop runtime](../apps/api/src/desktop/runtime.ts),
[DB client](../packages/db/src/client.ts), [repository migrations](../packages/db/drizzle/),
[DB fixture setup](../packages/db/tests/support/database.ts) and
[desktop MySQL tests](../packages/db/tests/mysql/desktop.test.ts).
Inspect migration packaging as well as application of SQL: a developer checkout's
migration directory is not automatically available inside an installed desktop.

Required behavior:

- Determine schema compatibility before serving business requests. A database newer
  than the app is refused; known pending application migrations can be applied automatically.
- Back up only when migrations are pending. Check disk space before the operation.
- Write the dump as `.sql.partial`; require successful process exit and the expected
  completion footer, then rename it to `.sql`. A partial file is never a usable backup.
- Persist upgrade state and the original verified backup path **before** any schema mutation.
- Failed backup means no migration and no business API. Failed migration means no API,
  a preserved recovery point and a plain actionable error.
- Never replace the recovery point with a new dump of a half-migrated database.
- Keep the newest five verified backups, plus the protected last known-good/recovery
  backup until the main plan's conditions permit its removal.
- Restore through the bundled client and private credentials. Verify recovery reached
  the expected source checkpoint and preserve the failed-version block as agreed.
- Do not hand-edit an applied migration or reset the repository baseline. Generate any
  genuinely required new migration from the schema under the big boss rules.

Tests must cover no-pending-migration behavior, dump/disk failure, partial dump,
migration failure, restart with upgrade state, backup retention, restored-state restart
and corrected-release recovery. Restore a real dump into a **separate owned scratch DB**
and compare records/checkpoint. Do not make a restore test overwrite a real database.

Phase 6 will supply the automatic updater. Phase 5 must not depend on an updater
that does not exist yet: a corrected installer can be installed manually during testing.
Do not implement Phase 6 as a shortcut to proving recovery.

## 8. Slice 5.4: installer preservation and clean Windows proof

Validate the actual built installer on a clean Windows VM. A successful run on the
development machine is not proof that all runtime prerequisites were bundled.

- Database and backups live outside `Program Files` and outside disposable install resources.
- Reinstall/update preserves credentials and records. Uninstall leaves the data intact.
- MySQL and its required Windows runtime work without system Node, pnpm, Rust,
  development tools or a separately configured MySQL service.
- A fresh unconfigured install initializes the engine and reports that the PC is unlinked.
- A test-only configured install logs in, opens a shift, sells and retains the open shift
  and saved transaction across closing, restarting and forced process termination.
- An existing unrelated MySQL installation remains untouched and can coexist.
- Validate pending migration, recovery and lack-of-space failure cases using disposable data.
- Measure installer size and record the actual result. The plan's 100–200 MB estimate
  is not a previously verified measurement or an acceptance guarantee.

Do not claim clean-VM acceptance if no VM was tested. If access is unavailable,
report that exact remaining verification requirement rather than marking 5.4 complete.

## 9. Validation workflow and available commands

Follow TDD for implementation. Establish a baseline for the authorized area, implement
one slice, verify that area, update the tracker with evidence, then stop at its boundary.
Do not recreate the Phase 4 mistake of bulk editing several future slices together.

Use the smallest appropriate workspace checks, **sequentially**:

```powershell
pnpm --filter @cashier/desktop prepare:desktop
pnpm --filter @cashier/desktop format:check
pnpm --filter @cashier/desktop lint
pnpm --filter @cashier/desktop typecheck
pnpm --filter @cashier/desktop test
pnpm --filter @cashier/desktop smoke:desktop
pnpm build:desktop
```

These are available commands, not instructions to run all of them after every small edit.
Preparation, Cargo, builds and smoke checks share files/resources; collect each result
before starting a conflicting command. The desktop smoke currently uses an owned fresh
scratch database, the actual bundled API/Node and offline startup/pinning/shutdown checks;
extend it deliberately for bundled MySQL as the relevant slices are completed.

When API/DB/server-core code changes, use their own lint/typecheck/build/test commands.
API `test` includes API MySQL integration through DB. Build shared dependencies when
required; do not accidentally test stale compiled `dist` against changed source.
Read package scripts and the main plan's section 7.7 before choosing commands.

At the end of the full phase, verify every workspace and the shared integrations,
desktop installer and clean-VM acceptance. The owner prefers separate workspace runs
instead of repeatedly launching the root test suite. Report every result honestly,
including any unavailable clean-VM proof or non-failing notices.

No tests are needed for this prose handoff itself. Check its links and whitespace.

## 10. How to keep the next handoff useful

Update this Phase 5 handoff after each completed slice with only:

- Authorized slice and exact completed behavior.
- Actual changed/new files and important integration points.
- Tests/checks that passed or failed, with commands and meaningful counts.
- Current remaining work, unresolved choices and any environment/VM limitation.
- Current Git state if material, including commits only when explicitly authorized.

Keep the [big boss plan](desktop-online-plan.md) authoritative and update its tracker
when a slice finishes. Preserve staged/unstaged owner edits. Do not write passwords,
private keys or connection strings into either document. Temporary artifacts/logs
are optional evidence; implementation and tests must not depend on their survival.

**Next action:** after the owner explicitly authorizes implementation, read the current
plan and state again, establish the 5.1 baseline, and implement **5.1 only**.
