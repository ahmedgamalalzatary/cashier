import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Db } from "@cashier/db";
import { verifyDesktopSchema } from "../../src/desktop/runtime.js";

const journal = JSON.parse(
  fs.readFileSync(
    new URL("../../../../packages/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: Array<{ when: number }> };
const checkpoint = journal.entries.at(-1)!.when;

function database(createdAt: number | null) {
  return {
    $client: {
      query: async () => [
        createdAt === null ? [] : [{ created_at: createdAt }],
      ],
    },
  } as unknown as Db;
}

describe("desktop database readiness", () => {
  it("accepts the schema version packaged with the backend", async () => {
    await expect(
      verifyDesktopSchema(database(checkpoint), checkpoint),
    ).resolves.toBeUndefined();
  });
  it.each([1791372433969, checkpoint - 1, checkpoint + 1, null])(
    "does not start against a mismatched schema (%s)",
    async (createdAt) => {
      await expect(
        verifyDesktopSchema(database(createdAt), checkpoint),
      ).rejects.toThrow("migrations");
    },
  );
});
