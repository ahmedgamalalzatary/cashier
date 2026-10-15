import { withBranch } from "@cashier/db";
import { testId } from "@cashier/shared/test-support";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@cashier/db";
import * as schema from "@cashier/db";
import { OrdersRepository } from "../../src/modules/orders/orders.repository.js";

function proxyDb() {
  return drizzle(async () => ({ rows: [] }), {
    schema,
    mode: "default",
  }) as unknown as Db;
}

describe("OrdersRepository refund figures", () => {
  it("compares what an order sold with what its refunds brought back", () => {
    const generated = withBranch(testId(23), () =>
      new OrdersRepository(proxyDb()).listRefundFigures([testId(1)]),
    )
      .toSQL()
      .sql.toLowerCase();

    expect(generated).toContain("from `order_lines`");
    // refund lines fill in what each sold line already returned
    expect(generated).toMatch(/left join `refund_lines`/);
    expect(generated).toMatch(/sum\(`refund_lines`\.`quantity`\)/);
    expect(generated).toMatch(/sum\(`refund_lines`\.`refund_amount`\)/);
    // refund rows are read inside the branch only
    expect(generated.toLowerCase().split("`branch_id` = ?").length - 1).toBe(2);
    // one row per sold line so partial refunds stay per line
    expect(generated).toMatch(/group by `order_lines`\.`order_id`, `order_lines`\.`id`/);
  });

  it("leaves out orders that are not in the requested list", () => {
    const generated = withBranch(testId(23), () =>
      new OrdersRepository(proxyDb()).listRefundFigures([testId(1)]),
    )
      .toSQL()
      .sql.toLowerCase();
    expect(generated.toLowerCase().split("?").length - 1).toBe(3);
    // the order filter scopes to the requested ids
    expect(generated).toContain("`order_id` in (?)");
  });
});

describe("OrdersRepository refunds of one order", () => {
  it("lists each refund document by id, amount and time", () => {
    const generated = withBranch(testId(23), () =>
      new OrdersRepository(proxyDb()).listOrderRefunds(testId(1)),
    )
      .toSQL()
      .sql.toLowerCase();
    expect(generated).toContain("from `refunds`");
    expect(generated).toContain("`refunds`.`order_id` = ?");
    expect(generated).toContain("order by `refunds`.`id` desc");
  });
});
