import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve(import.meta.dirname, "../scripts/version.mjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-version-"));
  t.after(() => {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), "cashier-version-")));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const native = path.join(directory, "src-tauri");
  fs.mkdirSync(native);
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  fs.writeFileSync(
    path.join(native, "tauri.conf.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  fs.writeFileSync(
    path.join(native, "Cargo.toml"),
    '[package]\nname = "app"\nversion = "0.1.0"\n\n[dependencies]\nother = "1.2.3"\n',
  );
  fs.writeFileSync(
    path.join(native, "Cargo.lock"),
    'version = 4\n\n[[package]]\nname = "app"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "1.2.3"\n',
  );
  return directory;
}

for (const [bump, expected] of [
  ["patch", "0.1.1"],
  ["minor", "0.2.0"],
  ["major", "1.0.0"],
]) {
  test(`a ${bump} release updates all desktop manifests and leaves dependencies alone`, (t) => {
    const directory = fixture(t);
    const result = spawnSync(
      process.execPath,
      [script, bump, "--directory", directory],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(directory, "package.json"))).version,
      expected,
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(directory, "src-tauri/tauri.conf.json")),
      ).version,
      expected,
    );
    const manifest = fs.readFileSync(
      path.join(directory, "src-tauri/Cargo.toml"),
      "utf8",
    );
    const lock = fs.readFileSync(
      path.join(directory, "src-tauri/Cargo.lock"),
      "utf8",
    );
    assert.ok(manifest.includes(`version = "${expected}"`));
    assert.ok(lock.includes(`name = "app"\nversion = "${expected}"`));
    assert.ok(lock.includes('name = "other"\nversion = "1.2.3"'));
    assert.ok(manifest.includes('other = "1.2.3"'));
  });
}

test("an invalid bump does not modify any manifest", (t) => {
  const directory = fixture(t);
  const before = fs.readFileSync(
    path.join(directory, "src-tauri/Cargo.toml"),
    "utf8",
  );
  const result = spawnSync(
    process.execPath,
    [script, "banana", "--directory", directory],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.equal(
    fs.readFileSync(path.join(directory, "src-tauri/Cargo.toml"), "utf8"),
    before,
  );
});
