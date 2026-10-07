import { describe, expect, it } from "vitest";
import type { Db } from "@cashier/db";
import { verifyDesktopSchema } from "../../src/desktop/runtime.js";

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
      verifyDesktopSchema(database(1791348558558), 1791348558558),
    ).resolves.toBeUndefined();
  });
  it.each([1791347268057, 1791348558559, null])(
    "does not start against a mismatched schema (%s)",
    async (createdAt) => {
      await expect(
        verifyDesktopSchema(database(createdAt), 1791348558558),
      ).rejects.toThrow("migrations");
    },
  );
});
