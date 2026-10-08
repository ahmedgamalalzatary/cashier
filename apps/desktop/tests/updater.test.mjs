import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const config = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../src-tauri/tauri.conf.json"),
    "utf8",
  ),
);
const updater = config.plugins?.updater ?? {};

test("updates come from this repository's latest GitHub release", () => {
  assert.deepEqual(updater.endpoints, [
    "https://github.com/ahmedgamalalzatary/cashier/releases/latest/download/latest.json",
  ]);
  assert.equal(updater.windows?.installMode, "passive");
});

test("the app trusts only the owner's update signing key", () => {
  // `pubkey` is the base64 of the minisign public key file
  const key = Buffer.from(updater.pubkey ?? "", "base64").toString("utf8");
  assert.match(key, /^untrusted comment: minisign public key/);
  assert.doesNotMatch(key, /secret key/i);
});

test("local installer builds need no private key", () => {
  // signed update files are produced only by the release workflow
  assert.equal(config.bundle.createUpdaterArtifacts, undefined);
});
