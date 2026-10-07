import { startDesktopApi } from "./runtime.js";

async function main() {
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
  const [settingsFile, manifestFile] = process.argv.slice(2);
  if (!settingsFile || !manifestFile)
    throw new Error("Desktop settings and runtime manifest are required");
  const runtime = await startDesktopApi(
    settingsFile,
    manifestFile,
    shutdown.signal,
  );
  try {
    process.stdout.write(
      JSON.stringify({ event: "ready", apiUrl: runtime.apiUrl }) + "\n",
    );
    await stopped;
  } finally {
    await runtime.close();
    process.stdin.destroy();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Desktop API startup failed";
  process.stdout.write(JSON.stringify({ event: "error", message }) + "\n", () =>
    process.exit(1),
  );
});
