import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectDependencyLicenses } from "../scripts/licenses.mjs";

function tree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-licenses-"));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "cashier-licenses-")));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (relative, contents) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  return { root, write };
}

const collect = (root, inputs) =>
  [...collectDependencyLicenses(root, inputs)].map(([key, text]) => [
    key,
    text.trim(),
  ]);

test("collects one license per bundled package", (t) => {
  const { root, write } = tree(t);
  write("node_modules/drizzle-orm/package.json", '{"name":"drizzle-orm","version":"0.44.0"}');
  write("node_modules/drizzle-orm/LICENSE", "drizzle license");
  write("node_modules/drizzle-orm/index.js", "");
  write("node_modules/other/package.json", '{"name":"other","version":"1.0.0"}');
  write("node_modules/other/LICENSE.md", "other license");

  assert.deepEqual(
    collect(root, [
      "node_modules/drizzle-orm/index.js",
      "node_modules/other/index.js",
    ]),
    [
      ["drizzle-orm@0.44.0", "drizzle license"],
      ["other@1.0.0", "other license"],
    ],
  );
});

test("keeps searching upward when a nested package.json declares no name", (t) => {
  const { root, write } = tree(t);
  // some packages ship a stray package.json inside a subfolder (dist, cjs, ...)
  write("node_modules/pack/sub/package.json", '{"main":"index.js"}');
  write("node_modules/pack/sub/index.js", "");
  write("node_modules/pack/package.json", '{"name":"pack","version":"2.0.0"}');
  write("node_modules/pack/LICENSE", "pack license");

  assert.deepEqual(collect(root, ["node_modules/pack/sub/index.js"]), [
    ["pack@2.0.0", "pack license"],
  ]);
});

test("ignores files outside node_modules and packages without a license", (t) => {
  const { root, write } = tree(t);
  write("apps/api/src/index.js", "");
  write("node_modules/bare/package.json", '{"name":"bare","version":"3.0.0"}');
  write("node_modules/bare/index.js", "");

  assert.deepEqual(
    collect(root, ["apps/api/src/index.js", "node_modules/bare/index.js"]),
    [],
  );
});

test("stops at the filesystem root without throwing", (t) => {
  const { root, write } = tree(t);
  write("node_modules/loose/index.js", "");

  assert.deepEqual(collect(root, ["node_modules/loose/index.js"]), []);
});
