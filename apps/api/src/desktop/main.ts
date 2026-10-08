import { closeDb, createDb } from "@cashier/db";
import { databaseBranches, linkDesktop } from "./link.js";
import {
  prepareForApp,
  readDesktopManifest,
  startDesktopApi,
} from "./runtime.js";
import { DesktopStartupError, restoreDesktopBackup } from "./upgrade.js";

// One JSON line per event; the desktop shell reads them from stdout.
const emit = (event: Record<string, unknown>, done?: () => void) =>
  process.stdout.write(JSON.stringify(event) + "\n", done);

/** Passed by the desktop shell through the environment, never the command line. */
function fromShell() {
  const databaseUrl = process.env.CASHIER_DATABASE_URL ?? "";
  delete process.env.CASHIER_DATABASE_URL;
  return {
    databaseUrl,
    mysqlBin: process.env.CASHIER_MYSQL_BIN ?? "",
    dataDir: process.env.CASHIER_DATA_DIR ?? process.cwd(),
  };
}

async function restore() {
  const { databaseUrl, mysqlBin, dataDir } = fromShell();
  const db = createDb(databaseUrl);
  try {
    await restoreDesktopBackup({ db, databaseUrl, mysqlBin, dataDir });
  } finally {
    await closeDb(db);
  }
  emit({ event: "restored" });
}

/**
 * Links this PC with the one-time code the shell passes in CASHIER_LINK_CODE
 * (plan Phase 9): the database is prepared first so the branch row can be
 * stored, then the settings file is completed.
 */
async function link(settingsFile: string, manifestFile: string) {
  const { databaseUrl, mysqlBin, dataDir } = fromShell();
  const code = process.env.CASHIER_LINK_CODE ?? "";
  delete process.env.CASHIER_LINK_CODE;
  const manifest = readDesktopManifest(manifestFile);
  const db = createDb(databaseUrl);
  try {
    await prepareForApp(db, databaseUrl, manifestFile, manifest, {
      mysqlBin,
      dataDir,
      onBusy: () => emit({ event: "busy" }),
    });
    const branch = await linkDesktop({
      settingsFile,
      code,
      appVersion: manifest.version,
      branches: databaseBranches(db),
    });
    emit({ event: "linked", branch });
  } finally {
    await closeDb(db);
  }
}

async function serve(settingsFile: string, manifestFile: string) {
  const shutdown = new AbortController();
  let finish: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    if (shutdown.signal.aborted) return;
    shutdown.abort();
    finish!();
    // Parent termination must not leave an orphan if an upstream request hangs.
    setTimeout(() => process.exit(1), 12_000).unref();
  };
  process.stdin.on("end", stop);
  process.stdin.on("error", stop);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data: string) => {
    if (data.includes("shutdown")) stop();
  });
  process.stdin.resume();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const { databaseUrl, mysqlBin, dataDir } = fromShell();
  const runtime = await startDesktopApi(
    settingsFile,
    manifestFile,
    shutdown.signal,
    databaseUrl,
    { mysqlBin, dataDir, onBusy: () => emit({ event: "busy" }) },
  );
  try {
    emit({ event: "ready", apiUrl: runtime.apiUrl });
    await stopped;
  } finally {
    await runtime.close();
    process.stdin.destroy();
  }
}

const [settingsFile, manifestFile, command] = process.argv.slice(2);
const task =
  command === "restore-backup"
    ? restore()
    : command === "link-device"
      ? link(settingsFile, manifestFile)
      : settingsFile && manifestFile
        ? serve(settingsFile, manifestFile)
        : Promise.reject(
            new Error("Desktop settings and runtime manifest are required"),
          );
void task.catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Desktop API startup failed";
  const canRestore = error instanceof DesktopStartupError && error.canRestore;
  emit({ event: "error", message, ...(canRestore && { restore: true }) }, () =>
    process.exit(1),
  );
});
