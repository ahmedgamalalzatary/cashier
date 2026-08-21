import { describe, expect, it } from "vitest";
import request from "supertest";
import type { ExternalOrderSummary } from "@cashier/shared";
import { createApp } from "../../../src/app.js";
import { ExternalOrdersRepository } from "../../../src/modules/orders/external-orders.repository.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const order = (id: number, overrides: Partial<ExternalOrderSummary> = {}) => ({
  id,
  customerName: `عميل ${id}`,
  customerPhone: `0100000000${id}`,
  subtotal: "100.00",
  discountAmount: "5.00",
  totalAmount: "95.00",
  deliveryFee: "0.00",
  createdAt: "2026-08-21T10:00:00",
  orderStatus: "pending" as const,
  paymentStatus: "unpaid" as const,
  paymentMethod: "cash_on_delivery" as const,
  orderType: "delivery" as const,
  itemCount: 2,
  ...overrides,
});

describe("cached external orders", () => {
  it("is append-only and serves local search, pagination, and complete totals", async () => {
    const repository = new ExternalOrdersRepository(db);
    await repository.insertUnseen([
      order(1),
      order(2, { totalAmount: "200.00", discountAmount: "0.00" }),
    ]);
    await repository.insertUnseen([
      order(1, { customerName: "يجب ألا يستبدل", totalAmount: "999.00" }),
    ]);
    const authorization = await loginAs(createApp(db, appOptions), "admin");

    const response = await request(createApp(db, appOptions))
      .get("/api/orders/external?search=عميل&page=1&pageSize=1")
      .set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      pagination: { totalCount: 2, totalPages: 2, hasNextPage: true },
      totals: { count: 2, sales: "295.00", discounts: "5.00", pending: 2 },
    });
    expect(response.body.data).toHaveLength(1);
    expect(
      (await repository.list({ page: 1, pageSize: 10 })).data,
    ).toContainEqual(
      expect.objectContaining({
        id: 1,
        customerName: "عميل 1",
        totalAmount: "95.00",
      }),
    );
  });
});
