import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * F07. The script recreates the live database, so the two ways it could go
 * wrong matter most: handing the client a password that is not the password,
 * and behaving differently in the shell the runbook invokes it with. Both are
 * checked by running it, not by reading it.
 */
const script = path.resolve(
  import.meta.dirname,
  "../../../scripts/database-recreate.sh",
);

/** A shell the runbook may invoke the script with. */
function shells(): Array<{ name: string; binary: string }> {
  const found: Array<{ name: string; binary: string }> = [];
  for (const [name, candidate] of [
    ["bash", process.env.SHELL],
    ["bash", "bash"],
    ["bash", "/bin/bash"],
    ["bash", "/usr/bin/bash"],
    ["bash", "C:\\Program Files\\Git\\bin\\bash.exe"],
    ["sh", "sh"],
    ["sh", "/bin/sh"],
    ["dash", "dash"],
    ["dash", "/usr/bin/dash"],
    ["dash", "/bin/dash"],
  ] as const) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["-c", "echo ok"], { stdio: "ignore" });
    } catch {
      continue;
    }
    if (found.some((shell) => shell.name === name)) continue;
    found.push({ name, binary: candidate });
  }
  return found;
}

const available = shells();
const directories: string[] = [];

const settings = {
  database: "cashier",
  /** The password Compose gave the container. */
  password: 'ab"cd',
  /** What the server accepts; differs to model a refused login. */
  serverPassword: 'ab"cd',
  charset: "utf8mb4",
  collation: "utf8mb4_unicode_ci",
};

/** A container whose `mysql` records its arguments and answers the metadata. */
function container(options: Partial<typeof settings> = {}) {
  const answer = { ...settings, ...options };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recreate-"));
  directories.push(directory);
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  const calls = path.join(directory, "calls.log");
  fs.writeFileSync(calls, "");

  fs.writeFileSync(
    path.join(bin, "mysql"),
    [
      "#!/bin/sh",
      'for arg in "$@"; do printf \'%s\\n\' "$arg" >> ' +
        `'${calls}'` +
        "; done",
      // refuse a wrong password, as the real client does
      `expected='-p` + answer.serverPassword.replace(/'/g, `'\\''`) + "'",
      'case "$*" in',
      '  *"$expected"*) ;;',
      '  *) echo "Access denied for user" >&2; exit 1 ;;',
      "esac",
      'for arg in "$@"; do',
      "  case $arg in",
      "    *SCHEMATA*)",
      `      printf '%s\t%s\n' '${answer.charset}' '${answer.collation}'`,
      "      exit 0",
      "      ;;",
      "  esac",
      "done",
      "exit 0",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(bin, "sudo"),
    [
      "#!/bin/sh",
      "script=",
      'for arg in "$@"; do script=$arg; done',
      "set -eu",
      `MYSQL_DATABASE='${answer.database}'`,
      `MYSQL_USER='cashier'`,
      `MYSQL_ROOT_PASSWORD='${answer.password}'`,
      "export MYSQL_DATABASE MYSQL_USER MYSQL_ROOT_PASSWORD",
      'exec /bin/sh -c "$script"',
      "",
    ].join("\n"),
  );
  for (const name of ["mysql", "sudo"]) {
    execFileSync(
      available[0].binary,
      [
        "-c",
        `chmod +x "$1"`,
        "chmod",
        path.join(bin, name).replace(/\\/g, "/"),
      ],
      { stdio: "ignore" },
    );
  }
  return { bin, calls, read: () => fs.readFileSync(calls, "utf8") };
}

function run(shell: string, stub: { bin: string }) {
  try {
    const stdout = execFileSync(shell, [script, ".env.production"], {
      encoding: "utf8",
      cwd: path.resolve(import.meta.dirname, "../../.."),
      env: {
        ...process.env,
        PATH: `${stub.bin}${path.delimiter}${process.env.PATH}`,
      },
      stdio: "pipe",
    });
    return { stdout, code: 0 };
  } catch (error) {
    return {
      stdout: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      code: Number(error.status ?? 1),
    };
  }
}

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!available.length)("recreating the live database", () => {
  it.each(available.map((shell) => [shell.name, shell.binary]))(
    "drops, recreates and grants under %s",
    (_name, shell) => {
      const stub = container();
      const { stdout, code } = run(shell, stub);

      expect(code, stdout).toBe(0);
      const calls = stub.read();
      expect(calls).toContain("DROP DATABASE IF EXISTS");
      expect(calls).toContain("CREATE DATABASE");
      expect(calls).toContain("GRANT ALL ON");
      // the collation it read, not a default
      expect(calls).toContain(settings.collation);
    },
  );

  it("passes the password as the value, not as the whole assignment", () => {
    // `-pMYSQL_ROOT_PASSWORD='pw'` is a password with that name, and the login
    // is refused; the recreate would stop before the drop.
    const stub = container();
    const { code, stdout } = run(available[0].binary, stub);

    // a rejected login would stop the script before the drop
    expect({ code, stdout }).toMatchObject({ code: 0 });
    expect(stub.read()).toContain(`-p${settings.password}`);
  });

  it("refuses to drop when the server rejects the credentials", () => {
    const stub = container({ serverPassword: "a-different-password" });
    const { code, stdout } = run(available[0].binary, stub);

    expect(code).not.toBe(0);
    expect(stdout).not.toContain("DROP DATABASE");
  });

  it("refuses to drop when it cannot read the collation", () => {
    // guessing here would recreate a database that is not the one dumped
    const stub = container({ collation: "" });
    const { code, stdout } = run(available[0].binary, stub);

    expect(code).not.toBe(0);
    expect(stdout).not.toContain("DROP DATABASE");
  });

  it("refuses a database name that would break out of the statement", () => {
    const stub = container({ database: "cashier`; DROP DATABASE mysql; --" });
    const { code } = run(available[0].binary, stub);

    expect(code).not.toBe(0);
    expect(stub.read()).not.toContain("DROP DATABASE IF EXISTS `cashier`;");
  });
});
