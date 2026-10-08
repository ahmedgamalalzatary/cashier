import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const read = (file) =>
  fs.readFileSync(path.resolve(import.meta.dirname, file), "utf8");
const config = JSON.parse(read("../src-tauri/tauri.conf.json"));
const capability = JSON.parse(read("../src-tauri/capabilities/default.json"));
const page = read("../../web/public/link.html");

test("the link window may call the shell", () => {
  assert.ok(capability.windows.includes("link"));
  // link.html is a plain page with no bundler, so it uses the global API
  assert.equal(config.app.withGlobalTauri, true);
});

test("the link page sends the typed code to the shell's link command", () => {
  assert.match(page, /invoke\("link_device", \{ code/);
  assert.match(page, /dir="rtl"/);
});

test("the link page never handles the device token", () => {
  assert.doesNotMatch(page, /deviceToken|DEVICE_TOKEN/);
});
