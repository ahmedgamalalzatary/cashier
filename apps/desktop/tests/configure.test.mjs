import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve(import.meta.dirname, "../scripts/configure.mjs");
function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cashier-configure-"),
  );
  t.after(() => {
    assert.ok(
      directory.startsWith(path.join(os.tmpdir(), "cashier-configure-")),
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const source = path.join(directory, "source.env");
  fs.writeFileSync(
    source,
    'DATABASE_URL="mysql://cashier:private-password@localhost/cashier"\nJWT_SECRET="a-private-secret-at-least-32-characters"\nADMIN_USERNAME="admin"\nADMIN_PASSWORD="local-admin-password"\nUNRELATED_SETTING="do-not-import"\n',
  );
  return { directory, source, destination: path.join(directory, "user-data") };
}
test("imports only application settings into the user-data folder", (t) => {
  const { source, destination } = fixture(t);
  fs.appendFileSync(
    source,
    'BRANCH_ID="019a1234-5678-7000-8000-000000000001"\n',
  );
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const settings = fs.readFileSync(
    path.join(destination, "settings.env"),
    "utf8",
  );
  assert.ok(
    settings.includes(
      'DATABASE_URL="mysql://cashier:private-password@localhost/cashier"',
    ),
  );
  assert.ok(!settings.includes("UNRELATED_SETTING"));
  assert.ok(
    settings.includes('BRANCH_ID="019a1234-5678-7000-8000-000000000001"'),
  );
  assert.ok(!result.stdout.includes("private-password"));
  assert.ok(!result.stdout.includes("local-admin-password"));
});
test("rejects a missing branch instead of selecting a branch automatically", (t) => {
  const { source, destination } = fixture(t);
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BRANCH_ID/);
  assert.ok(!fs.existsSync(path.join(destination, "settings.env")));
});
test("a second import preserves the user's edited settings", (t) => {
  const { source, destination } = fixture(t);
  fs.mkdirSync(destination);
  const target = path.join(destination, "settings.env");
  fs.writeFileSync(target, "user-edited-settings\n");
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(target, "utf8"), "user-edited-settings\n");
});
test("does not import a remote database into a local desktop installation", (t) => {
  const { source, destination } = fixture(t);
  fs.writeFileSync(
    source,
    'DATABASE_URL="mysql://cashier:password@remote.example/cashier"\nADMIN_USERNAME="admin"\nADMIN_PASSWORD="password"\n',
  );
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.ok(!fs.existsSync(path.join(destination, "settings.env")));
});
