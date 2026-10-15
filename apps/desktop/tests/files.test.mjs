import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  copyIfChanged,
  syncDirectory,
  writeIfChanged,
} from "../scripts/files.mjs";

function tree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-files-"));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "cashier-files-")));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (relative, contents) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };
  return { root, write };
}

// Cargo rebuilds the app whenever a bundled file's time moves, so an
// unchanged file must keep its old time.
const old = new Date("2020-01-01T00:00:00Z");
const age = (file) => fs.utimesSync(file, old, old);
const untouched = (file) =>
  assert.equal(fs.statSync(file).mtimeMs, old.getTime());

test("leaves a file with the same contents untouched", (t) => {
  const { write } = tree(t);
  const file = write("a.txt", "same");
  age(file);
  writeIfChanged(file, "same");
  untouched(file);
});

test("writes a file whose contents differ or that is missing", (t) => {
  const { root, write } = tree(t);
  const file = write("a.txt", "old");
  writeIfChanged(file, "new");
  assert.equal(fs.readFileSync(file, "utf8"), "new");
  const missing = path.join(root, "b.txt");
  writeIfChanged(missing, Buffer.from("fresh"));
  assert.equal(fs.readFileSync(missing, "utf8"), "fresh");
});

test("copies only when the source differs from the copy", (t) => {
  const { write } = tree(t);
  const source = write("source.bin", "binary");
  const copy = write("copy.bin", "binary");
  age(copy);
  copyIfChanged(source, copy);
  untouched(copy);
  fs.writeFileSync(source, "binary2");
  copyIfChanged(source, copy);
  assert.equal(fs.readFileSync(copy, "utf8"), "binary2");
});

test("mirrors a folder, keeping unchanged files and dropping stale ones", (t) => {
  const { root, write } = tree(t);
  write("from/0000.sql", "a");
  write("from/meta/_journal.json", "j2");
  const kept = write("to/0000.sql", "a");
  write("to/meta/_journal.json", "j1");
  write("to/old.sql", "gone");
  write("to/stale/x.json", "gone");
  age(kept);

  syncDirectory(path.join(root, "from"), path.join(root, "to"));

  untouched(kept);
  const to = path.join(root, "to");
  assert.equal(
    fs.readFileSync(path.join(to, "meta/_journal.json"), "utf8"),
    "j2",
  );
  assert.deepEqual(
    fs
      .readdirSync(to, { recursive: true })
      .map((p) => p.replaceAll("\\", "/"))
      .sort(),
    ["0000.sql", "meta", "meta/_journal.json"],
  );
});
