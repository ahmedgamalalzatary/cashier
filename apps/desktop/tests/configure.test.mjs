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
  // the bundled database replaces any configured server
  assert.ok(!settings.includes("DATABASE_URL"));
  assert.ok(!settings.includes("UNRELATED_SETTING"));
  assert.ok(
    settings.includes('BRANCH_ID="019a1234-5678-7000-8000-000000000001"'),
  );
  assert.ok(!result.stdout.includes("private-password"));
  assert.ok(!result.stdout.includes("local-admin-password"));
});
test("leaves the branch to the link screen when none is configured", (t) => {
  const { source, destination } = fixture(t);
  fs.appendFileSync(source, 'ONLINE_API_URL="http://127.0.0.1:4001/api"\n');
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
  assert.ok(!settings.includes("BRANCH_ID"));
  // a developer PC may link against a local online API
  assert.ok(settings.includes('ONLINE_API_URL="http://127.0.0.1:4001/api"'));
});
test("rejects a branch that is not a UUID instead of guessing one", (t) => {
  const { source, destination } = fixture(t);
  fs.appendFileSync(source, 'BRANCH_ID="1"\n');
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BRANCH_ID/);
  assert.ok(!fs.existsSync(path.join(destination, "settings.env")));
});
test("an existing file keeps every line and only gains missing settings", (t) => {
  const { source, destination } = fixture(t);
  fs.appendFileSync(
    source,
    'BRANCH_ID="019a1234-5678-7000-8000-000000000001"\n',
  );
  fs.mkdirSync(destination);
  const target = path.join(destination, "settings.env");
  // written by the app on its first start, then edited by the user
  const existing =
    'MYSQL_PASSWORD="kept-database-password"\nADMIN_USERNAME="edited-admin"\n';
  fs.writeFileSync(target, existing);
  const result = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const settings = fs.readFileSync(target, "utf8");
  assert.ok(settings.startsWith(existing));
  assert.equal(settings.match(/^ADMIN_USERNAME=/gm).length, 1);
  assert.ok(
    settings.includes('BRANCH_ID="019a1234-5678-7000-8000-000000000001"'),
  );
  assert.ok(settings.includes('ADMIN_PASSWORD="local-admin-password"'));
  assert.ok(!result.stdout.includes("local-admin-password"));

  const again = spawnSync(
    process.execPath,
    [script, "--source", source, "--directory", destination],
    { encoding: "utf8" },
  );
  assert.equal(again.status, 0, again.stderr);
  assert.equal(fs.readFileSync(target, "utf8"), settings);
});
test("writes to the folder every Windows user shares by default", (t) => {
  const { directory, source } = fixture(t);
  fs.appendFileSync(
    source,
    'BRANCH_ID="019a1234-5678-7000-8000-000000000001"\n',
  );
  const result = spawnSync(process.execPath, [script, "--source", source], {
    encoding: "utf8",
    env: { ...process.env, ProgramData: directory },
  });
  assert.equal(result.status, 0, result.stderr);
  const shared = path.join(directory, "Cashier");
  assert.ok(fs.existsSync(path.join(shared, "settings.env")));
  const acl = spawnSync("icacls", [shared], { encoding: "utf8" }).stdout;
  assert.match(acl, /BUILTIN\\Users:\(OI\)\(CI\)\(M\)/);
});
