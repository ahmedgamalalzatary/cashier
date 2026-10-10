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

const releaseConfig = path.resolve(
  import.meta.dirname,
  "../src-tauri/tauri.release.conf.json",
);
const workflowFile = path.resolve(
  import.meta.dirname,
  "../../../.github/workflows/desktop-release.yml",
);

test("only the release build signs update files", () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(releaseConfig, "utf8")), {
    bundle: { createUpdaterArtifacts: true },
  });
});

test("a desktop-v tag builds, signs and publishes the release", () => {
  const workflow = fs.readFileSync(workflowFile, "utf8");
  assert.match(workflow, /tags:\s*\[\s*"desktop-v\*"\s*\]/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /contents: write/);
  // the tag must name the version being built
  assert.match(workflow, /desktop-v\$\{version\}/);
  assert.match(
    workflow,
    /args: --config src-tauri\/tauri\.release\.conf\.json/,
  );
  assert.match(workflow, /tagName: desktop-v__VERSION__/);
  // a draft is invisible to releases/latest, so installed PCs would never see it
  assert.match(workflow, /releaseDraft: false/);
  assert.match(workflow, /prerelease: false/);
  for (const secret of [
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  ])
    assert.ok(
      workflow.includes(`${secret}: \${{ secrets.${secret} }}`),
      `${secret} is passed from the repository secrets`,
    );
});

test("every workflow action is pinned to an exact commit", () => {
  const uses = [
    ...fs.readFileSync(workflowFile, "utf8").matchAll(/uses: (\S+)/g),
  ]
    .map((match) => match[1])
    // A workflow from this repository runs at the same commit as the release,
    // so it has no version to pin.
    .filter((action) => !action.startsWith("./.github/workflows/"));
  assert.ok(uses.length >= 5);
  for (const action of uses)
    assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
});
