import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * F07. The VPS runbook read its settings with grep/cut, which is not dotenv:
 * `MYSQL_DATABASE="cashier"` yielded the name `"cashier"` with the quotes
 * still attached, and `tr -d '"'` removed a quote that belonged to the
 * password itself. A quoted name and a mangled password both reach a command
 * that drops and recreates the live database, so these are tested against a
 * real shell rather than reasoned about.
 */
const script = path.resolve(
  import.meta.dirname,
  "../../../scripts/read-prod-env.sh",
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

function envFile(contents: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prod-env-"));
  directories.push(directory);
  const file = path.join(directory, ".env.production");
  fs.writeFileSync(file, contents);
  return file;
}

/** Runs the script and reads the values back the way the runbook will. */
function read(file: string, keys: string[]) {
  const assignments = execFileSync(shell!, [script, file, ...keys], {
    encoding: "utf8",
  });
  // eval the printed assignments exactly as the runbook does, then read each
  // value back the way a command line would use it
  const print = keys.map((key) => `printf '%s\\n' "\${${key}}"`).join("\n");
  return execFileSync(shell!, ["-c", `set -eu\n${assignments}\n${print}`], {
    encoding: "utf8",
  })
    .split("\n")
    .slice(0, -1);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!shell)("reading the VPS settings file", () => {
  it("removes one matching pair of quotes from a value", () => {
    const file = envFile('MYSQL_DATABASE="cashier"\n');

    expect(read(file, ["MYSQL_DATABASE"])).toEqual(["cashier"]);
  });

  it("keeps a quote that belongs to the password itself", () => {
    // `tr -d '"'` turns this password into a different, wrong one
    const file = envFile("MYSQL_ROOT_PASSWORD='ab\"cd'\n");

    expect(read(file, ["MYSQL_ROOT_PASSWORD"])).toEqual(['ab"cd']);
  });

  it("keeps spaces and shell metacharacters intact", () => {
    const file = envFile(
      [
        'MYSQL_PASSWORD=pa$$ w; rm -rf / `id` "quoted"',
        'MYSQL_ROOT_PASSWORD="a b\'c\\\\d"',
      ].join("\n"),
    );

    expect(read(file, ["MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD"])).toEqual([
      'pa$$ w; rm -rf / `id` "quoted"',
      "a b'c\\d",
    ]);
  });

  it("uses the Compose default when the file omits a key", () => {
    const file = envFile("MYSQL_PASSWORD=x\n");

    expect(read(file, ["MYSQL_DATABASE", "MYSQL_USER"])).toEqual([
      "cashier",
      "cashier",
    ]);
  });

  it("refuses a key it cannot fill rather than passing an empty value", () => {
    // an empty password would reach mysqldump as no password at all
    const file = envFile("MYSQL_ROOT_PASSWORD=\n");

    expect(() => read(file, ["MYSQL_ROOT_PASSWORD"])).toThrow();
  });

  it("takes the last assignment, as Compose does", () => {
    const file = envFile('MYSQL_DATABASE=first\nMYSQL_DATABASE="second"\n');

    expect(read(file, ["MYSQL_DATABASE"])).toEqual(["second"]);
  });

  it("keeps a value that is only quotes apart from an empty one", () => {
    const file = envFile("MYSQL_ROOT_PASSWORD=\"''\"\n");

    expect(read(file, ["MYSQL_ROOT_PASSWORD"])).toEqual(["''"]);
  });
});
