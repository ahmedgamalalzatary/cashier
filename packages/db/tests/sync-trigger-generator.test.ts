import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  generateSyncTriggers,
  writeTriggerMigration,
} from "../scripts/generate-sync-triggers.js";

const plan = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../../docs/desktop-online-plan.md"),
  "utf8",
);
const owned: string[] = [];
afterEach(() => {
  for (const directory of owned.splice(0)) {
    if (
      !directory.startsWith(
        path.join(os.tmpdir(), "cashier-trigger-generator-"),
      )
    )
      throw new Error("Unexpected scratch path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
it("rejects an upload filter the generator cannot implement rather than guessing", () => {
  expect(() =>
    generateSyncTriggers(
      plan.replace(
        "`users` rows with `role = 'cashier'` only",
        "`users` rows with `role = 'admin'` only",
      ),
    ),
  ).toThrow(/filter/i);
});
it("refuses to turn the mixed user table into an unfiltered upload", () => {
  const changed = plan.replace(/\| Up \(filtered\)\s*\|/, "| Up | ");
  expect(() => generateSyncTriggers(changed)).toThrow(/users/i);
});
it("fails when an upload table is missing from the direction contract", () => {
  expect(() => generateSyncTriggers(plan.replace("`employees`, ", ""))).toThrow(
    /employees/,
  );
});
it("creates a new registered migration, preserves prior files, and writes nothing on repeat", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cashier-trigger-generator-"),
  );
  owned.push(directory);
  fs.mkdirSync(path.join(directory, "meta"));
  for (const name of [
    "0000_baseline.sql",
    "meta/0000_snapshot.json",
    "meta/_journal.json",
  ])
    fs.copyFileSync(
      path.resolve(import.meta.dirname, "../drizzle", name),
      path.join(directory, name),
    );
  const initial = JSON.parse(
    fs.readFileSync(path.join(directory, "meta/_journal.json"), "utf8"),
  );
  initial.entries = initial.entries.slice(0, 1);
  fs.writeFileSync(
    path.join(directory, "meta/_journal.json"),
    JSON.stringify(initial),
  );
  const previous = fs.readFileSync(path.join(directory, "0000_baseline.sql"));
  const file = writeTriggerMigration(directory, plan);
  expect(file).toMatch(/0001_sync_triggers\.sql$/);
  const journal = JSON.parse(
    fs.readFileSync(path.join(directory, "meta/_journal.json"), "utf8"),
  );
  expect(journal.entries.map((entry: { tag: string }) => entry.tag)).toEqual([
    "0000_baseline",
    "0001_sync_triggers",
  ]);
  expect(fs.readFileSync(path.join(directory, "0000_baseline.sql"))).toEqual(
    previous,
  );
  const before = fs.statSync(file!).mtimeMs;
  expect(writeTriggerMigration(directory, plan)).toBeNull();
  expect(fs.statSync(file!).mtimeMs).toBe(before);
  expect(
    JSON.parse(
      fs.readFileSync(path.join(directory, "meta/_journal.json"), "utf8"),
    ),
  ).toEqual(journal);
});
