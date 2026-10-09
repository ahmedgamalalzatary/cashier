import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect } from "vitest";
import { it, TEST_BRANCH_ID } from "../support/ids.js";
import { db } from "../support/api-setup.js";
import { loadTestEnvironment } from "../support/test-env.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-resume-events-")))
      throw new Error("Unexpected resume test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function runResume(pending = false) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cashier-resume-events-"),
  );
  directories.push(directory);
  const settings = path.join(directory, "settings.env");
  fs.writeFileSync(settings, "");
  if (pending)
    fs.writeFileSync(
      path.join(directory, "pending-link.json"),
      JSON.stringify({
        branchId: TEST_BRANCH_ID,
        branchName: "Resumed branch",
        deviceToken: "a-resumed-device-token-with-at-least-32-characters",
      }),
    );
  const [rows] = await db.$client.query(
    "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
  );
  const manifest = path.join(directory, "manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      version: "0.2.3",
      schemaCreatedAt: Number(
        (rows as Array<{ checkpoint: number }>)[0].checkpoint,
      ),
    }),
  );
  const apiDirectory = path.resolve(
    import.meta.dirname,
    "../../../../apps/api",
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--conditions=development",
      "--import=tsx",
      path.join(apiDirectory, "src/desktop/main.ts"),
      settings,
      manifest,
      "resume-link",
    ],
    {
      cwd: apiDirectory,
      windowsHide: true,
      timeout: 45_000,
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        CASHIER_DATABASE_URL: loadTestEnvironment(),
        CASHIER_DATA_DIR: directory,
      },
    },
  );
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string; branch?: unknown });
}

describe("the desktop resume event boundary", () => {
  it("does not announce a finished link when there was no pending answer", async () => {
    expect(
      (await runResume()).filter((event) => event.event === "linked"),
    ).toEqual([]);
  }, 60_000);

  it("announces the actual branch only after finishing a saved answer", async () => {
    expect(
      (await runResume(true)).filter((event) => event.event === "linked"),
    ).toEqual([
      {
        event: "linked",
        branch: { id: TEST_BRANCH_ID, name: "Resumed branch" },
      },
    ]);
  }, 60_000);
});
