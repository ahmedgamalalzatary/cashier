import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F07. Every command in the runbook was checked by reading its text, which is
 * how a runbook ended up reading `$DB` where the helper set `MYSQL_DATABASE`,
 * and passing `-pMYSQL_ROOT_PASSWORD='pw'` to a command that drops the live
 * database. These execute the documented commands against stubs, so a command
 * that cannot work fails here instead of on the VPS.
 *
 * Only the host side is stubbed. Each command is run the way the runbook runs
 * it: through `sh`, with `sudo` replaced, so quoting and `$?` behave as
 * written.
 */
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const runbook = fs.readFileSync(path.join(repoRoot, "docs/docker.md"), "utf8");

const directories: string[] = [];

/** Every bash fence in the runbook, in order. */
function blocks(): string[] {
  return [...runbook.matchAll(/```bash\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

/** A shell the runbook's own commands can be executed with. */
function shell(): string | null {
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

const interpreter = shell();

/**
 * Stubs `sudo` so the recorded calls can be inspected, and answers the two
 * things the runbook asks the container: mysqldump output and the collation.
 */
function host(options: {
  dumpExit?: number;
  dumpTail?: string;
  collation?: string;
}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runbook-"));
  directories.push(directory);
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  const calls = path.join(directory, "calls.log");
  fs.writeFileSync(calls, "");
  // The runbook writes into `backups/`, so the executed commands need a place to
  // write that is not the repository.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "runbook-work-"));
  directories.push(work);
  fs.cpSync(path.join(repoRoot, "docs"), path.join(work, "docs"), {
    recursive: true,
  });
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(work, "scripts"), {
    recursive: true,
  });

  // The real client inside the container. It records what it was asked to do
  // and answers the collation query, so the script's own logic decides whether
  // the drop happens.
  fs.writeFileSync(
    path.join(bin, "mysql"),
    [
      "#!/bin/sh",
      'for arg in "$@"; do printf \'%s\\n\' "$arg" >> ' +
        `'${calls}'` +
        "; done",
      'for arg in "$@"; do',
      "  case $arg in",
      "    *SCHEMATA*)",
      `      printf '%s\\t%s\\n' 'utf8mb4' '${options.collation ?? "utf8mb4_unicode_ci"}'`,
      "      exit 0",
      "      ;;",
      "  esac",
      "done",
      "exit 0",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(bin, "mysqldump"),
    [
      "#!/bin/sh",
      'for arg in "$@"; do printf \'%s\\n\' "$arg" >> ' +
        `'${calls}'` +
        "; done",
      `printf '%s\\n' '${(
        options.dumpTail ?? "  -- Dump completed on 2026-10-09 10:00:00"
      ).replace(/'/g, "'\\''")}'`,
      `exit ${options.dumpExit ?? 0}`,
      "",
    ].join("\n"),
  );
  // `sudo docker compose ... [stop|exec] ...`: run the compose action here. The
  // settings Compose would have given the container are provided to it.
  fs.writeFileSync(
    path.join(bin, "sudo"),
    [
      "#!/bin/sh",
      "set -eu",
      // `compose stop ...` changes nothing a stub needs to model
      'case "$*" in',
      "  *compose\\ stop*) exit 0 ;;",
      "esac",
      "script=",
      'for arg in "$@"; do script=$arg; done',
      "MYSQL_DATABASE=cashier",
      "MYSQL_USER=cashier",
      `MYSQL_ROOT_PASSWORD='ab"cd'`,
      "export MYSQL_DATABASE MYSQL_USER MYSQL_ROOT_PASSWORD",
      'exec /bin/sh -c "$script"',
      "",
    ].join("\n"),
  );
  // Windows keeps no executable bit, so a stub that never runs would make the
  // failure cases below pass for the wrong reason.
  for (const name of ["sudo", "mysql", "mysqldump"]) {
    execFileSync(
      interpreter!,
      [
        "-c",
        `chmod +x "$1"`,
        "chmod",
        path.join(bin, name).replace(/\\/g, "/"),
      ],
      { stdio: "ignore" },
    );
  }
  return { bin, calls, work };
}

/** Runs the recreate script as the runbook does, against the stubbed host. */
function runRecreate(stub: { bin: string; calls: string; work: string }) {
  try {
    const stdout = execFileSync(
      interpreter!,
      [path.join(repoRoot, "scripts/database-recreate.sh"), ".env.production"],
      {
        encoding: "utf8",
        cwd: repoRoot,
        env: {
          ...process.env,
          PATH: `${stub.bin}${path.delimiter}${process.env.PATH}`,
        },
        stdio: "pipe",
      },
    );
    return { stdout, code: 0 };
  } catch (error) {
    return {
      stdout: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      code: Number(error.status ?? 1),
    };
  }
}

function run(
  blocksToRun: string[],
  stub: { bin: string; calls: string; work: string },
): { stdout: string; code: number } {
  const script = blocksToRun.join("\n");
  const file = path.join(stub.work, "block.sh");
  fs.writeFileSync(file, script);
  // executed in the scratch copy, so `backups/` never appears in the repository
  const work = stub.work;
  try {
    const stdout = execFileSync(interpreter!, [file], {
      encoding: "utf8",
      // the runbook says to run every command from the directory holding
      // docs/ and scripts/, and its script paths are relative to it
      cwd: work,
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

/** The documented commands from `heading` up to the next heading. */
function section(heading: string, nextHeading: string) {
  const start = runbook.indexOf(heading);
  const end = runbook.indexOf(nextHeading, start + 1);
  if (start < 0 || end < 0) throw new Error(`section not found: ${heading}`);
  const body = runbook.slice(start, end);
  return [...body.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function clean() {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
}

describe.skipIf(!interpreter)("the restore procedure as written", () => {
  it("is made of bash blocks", () => {
    expect(blocks().length).toBeGreaterThan(10);
  });

  it("reaches step 2 with a verified safety dump", () => {
    const stub = host({});
    const step = section("**1. Stop the services", "**2. Replace the database");
    const { stdout } = run(step, stub);

    expect(stdout, `step 1 failed:\n${stdout}`).toMatch(/exit: 0/);
    expect(stdout).toContain("-- Dump completed");
    clean();
  });

  it("reaches mysqldump with the container's own settings, not host variables", () => {
    const stub = host({});
    const dump = section(
      "## Database backup",
      "A dump stored only on the same",
    );
    const { stdout, code } = run(dump.slice(0, 2), stub);

    expect(code, `backup failed:\n${stdout}`).toBe(0);
    const calls = fs
      .readFileSync(stub.calls, "utf8")
      .split("\n")
      .filter(Boolean)
      .join(" ");
    // the runbook must send the container's own variables, which the container
    // then expands; the host must never pass an empty or short-named value
    const commands = section(
      "## Database backup",
      "A dump stored only on the same",
    );
    expect(commands.join("\n")).toContain('"$MYSQL_DATABASE"');
    expect(commands.join("\n")).toContain('"$MYSQL_ROOT_PASSWORD"');
    expect(commands.join("\n")).not.toMatch(/\$\(?(DB|ROOT_PW|APP_USER)\)?\b/);
    // and the values that reached the client are the resolved ones
    expect(calls).toContain('-pab"cd');
    expect(calls).toContain("cashier");
    clean();
  });

  it("reports the dump exit code and checks the file it just wrote", () => {
    const stub = host({});
    const backup = section(
      "## Database backup",
      "A dump stored only on the same",
    );
    const { stdout, code } = run(backup.slice(0, 3), stub);

    expect(code, `backup failed:\n${stdout}`).toBe(0);
    expect(stdout).toContain("exit: 0");
    expect(stdout).toContain("-- Dump completed");
    clean();
  });

  it("does not report a dump that failed", () => {
    const stub = host({ dumpExit: 2, dumpTail: "mysqldump: Got error: 1045" });
    const backup = section(
      "## Database backup",
      "A dump stored only on the same",
    );
    const { stdout } = run(backup.slice(0, 3), stub);

    // the dump is reported as failed and no completion marker appears
    expect(stdout).toContain("exit: 2");
    expect(stdout).not.toContain("-- Dump completed");
    clean();
  });

  it("does not reach the drop when the collation cannot be read", () => {
    // the recreate script reads the collation and drops in one shell, so a
    // collation it cannot read means the drop never runs
    const stub = host({ collation: "" });
    const { code, stdout } = runRecreate(stub);

    expect(code, stdout).not.toBe(0);
    expect(stdout).not.toContain("DROP DATABASE");
    clean();
  });

  it("drops, recreates and grants using the collation it read", () => {
    const stub = host({});
    const { code, stdout } = runRecreate(stub);

    expect(code, `recreate failed:\n${stdout}`).toBe(0);
    const calls = fs.readFileSync(stub.calls, "utf8");
    expect(calls).toContain("DROP DATABASE IF EXISTS");
    expect(calls).toContain("CREATE DATABASE");
    expect(calls).toContain("utf8mb4_unicode_ci");
    expect(calls).toContain("GRANT ALL ON");
    clean();
  });

  it("names the collation it read before dropping", () => {
    const stub = host({});
    runRecreate(stub);

    expect(fs.readFileSync(stub.calls, "utf8")).toContain("utf8mb4");
    clean();
  });
});
