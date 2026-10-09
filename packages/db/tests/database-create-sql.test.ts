import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * F07. The restore recreated the database with a hard-coded collation while
 * claiming to preserve it. These check the statement it prints, and that it
 * refuses rather than inventing a collation when the server will not answer.
 */
const script = path.resolve(
  import.meta.dirname,
  "../../../scripts/database-create-sql.sh",
);

function bash(): string | null {
  for (const candidate of [
    process.env.SHELL,
    "bash",
    "/bin/bash",
    "/usr/bin/bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
  ]) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["-c", "echo ok"], { stdio: "ignore" });
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

const shell = bash();
const directories: string[] = [];

function scratchEnv() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "charset-"));
  directories.push(directory);
  const file = path.join(directory, ".env.production");
  fs.writeFileSync(file, 'MYSQL_ROOT_PASSWORD="root-pw"\n');
  return file;
}

/** Runs the script with the docker call replaced by a canned server answer. */
function run(envFile: string, answer: string) {
  const stub = path.join(path.dirname(envFile), "bin");
  fs.mkdirSync(stub, { recursive: true });
  const fakeCompose = path.join(stub, "sudo");
  fs.writeFileSync(
    fakeCompose,
    ["#!/bin/sh", `printf '%s\\n' '${answer.replace(/'/g, "'\\''")}'`, ""].join(
      "\n",
    ),
  );
  fs.chmodSync(fakeCompose, 0o755);
  return execFileSync(shell!, [script, envFile, "cashier"], {
    encoding: "utf8",
    env: {
      ...process.env,
      // the script calls `sudo docker compose ...`; this stub stands in for it
      PATH: `${stub}${path.delimiter}${process.env.PATH}`,
    },
  });
}

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!shell)("recreating the database", () => {
  it("uses the character set and collation the live database has", () => {
    // not utf8mb4_0900_ai_ci, which the runbook used to assume
    const out = run(scratchEnv(), "utf8mb4\tutf8mb4_unicode_ci");

    expect(out.trim()).toBe(
      "CREATE DATABASE `cashier` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    );
  });

  it("refuses to print a statement when the server will not answer", () => {
    const file = scratchEnv();

    expect(() => run(file, "")).toThrow();
  });

  it("refuses a database name that would break out of the statement", () => {
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "inject-"));
    directories.push(stubDir);
    const file = path.join(stubDir, ".env.production");
    fs.writeFileSync(file, 'MYSQL_ROOT_PASSWORD="root-pw"\n');

    expect(() =>
      execFileSync(
        shell!,
        [script, file, "cashier`; DROP DATABASE mysql; --"],
        { encoding: "utf8" },
      ),
    ).toThrow();
  });
});
