import { repositoryIt as it } from "@cashier/db/test-support/ids";
import { testId } from "@cashier/shared/test-support";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect } from "vitest";
import type { Db } from "@cashier/db";
import * as schema from "@cashier/db";
import { RefundsRepository } from "../../src/modules/refunds/refunds.repository.js";

function proxyDb() {
  return drizzle(async () => ({ rows: [] }), {
    schema,
    mode: "default",
  }) as unknown as Db;
}

describe("RefundsRepository line rows", () => {
  it("exposes the stored gross amount alongside the cash refund amount", () => {
    const generated = new RefundsRepository(proxyDb())
      .listLines(testId(1))
      .toSQL()
      .sql.toLowerCase();

    expect(generated).toContain("`refund_lines`.`gross_amount`");
    expect(generated).toContain("`refund_lines`.`refund_amount`");
  });
});
