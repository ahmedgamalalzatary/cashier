import { it, TEST_BRANCH_ID, testId } from "../support/ids.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { branches } from "@cashier/db";
import { db } from "../support/api-setup.js";
import {
  databaseBranches,
  linkDesktop,
} from "../../../../apps/api/src/desktop/link.js";

const TOKEN = "t".repeat(43);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-link-db-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function emptySettings() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-link-db-"));
  directories.push(directory);
  const file = path.join(directory, "settings.env");
  fs.writeFileSync(file, "");
  return file;
}

const onlineAnswers = (branch: { id: string; name: string }) => async () =>
  new Response(JSON.stringify({ deviceToken: TOKEN, branch }), {
    status: 201,
  });

const nameOf = (id: string) =>
  db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, id))
    .then((rows) => rows[0]?.name);

describe("desktop link against the local database", () => {
  it("adds a branch this PC does not hold yet", async () => {
    const id = testId(950);

    await databaseBranches(db).save({ id, name: "فرع جديد" });

    expect(await nameOf(id)).toBe("فرع جديد");
  });

  it("takes the online name for the branch this PC already holds", async () => {
    const file = emptySettings();

    await linkDesktop({
      settingsFile: file,
      code: "ABCD2345",
      appVersion: "0.3.0",
      branches: databaseBranches(db),
      fetch: onlineAnswers({ id: TEST_BRANCH_ID, name: "الاسم من الموقع" }),
    });

    expect(await nameOf(TEST_BRANCH_ID)).toBe("الاسم من الموقع");
    expect(fs.readFileSync(file, "utf8")).toContain(
      `BRANCH_ID="${TEST_BRANCH_ID}"`,
    );
  });

  it("leaves the database alone when the code is for another branch", async () => {
    const before = await nameOf(TEST_BRANCH_ID);

    await expect(
      linkDesktop({
        settingsFile: emptySettings(),
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches: databaseBranches(db),
        fetch: onlineAnswers({ id: testId(951), name: "فرع غريب" }),
      }),
    ).rejects.toThrow();

    expect(await nameOf(TEST_BRANCH_ID)).toBe(before);
    expect(await nameOf(testId(951))).toBeUndefined();
  });
});
