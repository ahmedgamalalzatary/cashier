import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "../../src/db/index.js";
import { ExternalOrdersRepository } from "../../src/modules/orders/external-orders.repository.js";

describe("ExternalOrdersRepository search", () => {
  it("escapes LIKE wildcards in the search pattern", async () => {
    const seen: unknown[][] = [];
    const db = drizzle(async (_sql: string, params: unknown[]) => {
      seen.push(params);
      return { rows: [] };
    }, {}) as unknown as Db;

    await new ExternalOrdersRepository(db).list({
      search: "100%_\\",
      page: 1,
      pageSize: 10,
    });

    const patterns = seen
      .flat()
      .filter(
        (param): param is string =>
          typeof param === "string" && param.includes("100"),
      );
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern).toBe("%100\\%\\_\\\\%");
    }
  });
});
