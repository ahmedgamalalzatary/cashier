import { withBranch } from "@cashier/db";
import { testId } from "@cashier/shared/test-support";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@cashier/db";
import * as schema from "@cashier/db";
import { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";

function proxyDb() {
  return drizzle(async () => ({ rows: [] }), {
    schema,
    mode: "default",
  }) as unknown as Db;
}

describe("PurchasesRepository invoices left to transfer", () => {
  const query = () =>
    withBranch(testId(23), () =>
      new PurchasesRepository(proxyDb()).listInvoicesWithStock(),
    );

  it("compares what each line still owes the cafe with its transfers", () => {
    const generated = query().toSQL().sql.toLowerCase();

    expect(generated).toContain("from `purchase_lines`");
    // stock per line minus everything that invoice already sent to the cafe
    expect(generated).toMatch(
      /max\(\s*cast\(purchase_lines\.stock_quantity as decimal\(14,3\)/,
    );
    expect(generated).toMatch(
      /sum\(\s*cast\(transfer_lines\.quantity as decimal\(14,3\)/,
    );
    // the transfers counted are the ones carried by this invoice
    expect(generated).toContain(
      "transfers.purchase_invoice_id = purchase_lines.invoice_id",
    );
    expect(generated).toContain(
      "transfer_lines.item_id = purchase_lines.item_id",
    );
    // nothing leaves the branch: the subquery and the outer filter both carry it
    expect(generated.split("?").length - 1).toBe(2);
    expect(query().toSQL().params[0]).toBe(testId(23));
  });

  it("is grouped by invoice so each row maps to one summary", () => {
    const generated = query().toSQL().sql.toLowerCase();
    expect(generated).toMatch(/group by `purchase_lines`\.`invoice_id`/);
  });
});
