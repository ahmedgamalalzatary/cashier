import { beforeEach, it } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  orderLineAllocations,
  orderLines,
  refundLineAllocations,
  stockBatches,
  stockMovements,
  wasteEntries,
} from "@cashier/db";
import { db } from "../support/api-setup.js";
import {
  app,
  setupRefundSession,
  soldExternalOrder,
  soldResaleOrder,
} from "../support/refunds-fixtures.js";

let authorization: { readonly Authorization: string };
let adminAuthorization: {
  readonly Authorization: string;
  readonly "X-Branch-Id": string;
};

beforeEach(async () => {
  ({ authorization, adminAuthorization } = await setupRefundSession());
});

describe("refund shift rules and external products", () => {
  it("rejects refund creation without an open shift", async () => {
    const fixture = await soldResaleOrder(authorization);
    const current = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    await request(app())
      .post(`/api/shifts/${current.id}/close`)
      .set(authorization)
      .send({ actualCash: 100 });

    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });

    expect(response.status).toBe(409);
  });

  it("lets an admin refund without a shift and keeps it out of the cashier drawer", async () => {
    const fixture = await soldResaleOrder(authorization);

    const response = await request(app())
      .post("/api/refunds")
      .set(adminAuthorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      shiftId: null,
      isAdminRefund: true,
      cashierName: "مدير",
      amount: "9.00",
    });
    const shift = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    expect(shift.totals.refunds).toBe("0.00");
  });

  it("still requires an open shift from a cashier", async () => {
    const fixture = await soldResaleOrder(authorization);
    const current = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    await request(app())
      .post(`/api/shifts/${current.id}/close`)
      .set(authorization)
      .send({ actualCash: 100 });

    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });

    expect(response.status).toBe(409);
  });

  it("uses the sale allocation snapshot when refunding an external product", async () => {
    const fixture = await soldResaleOrder(authorization);
    await db
      .update(orderLines)
      .set({ type: "external_product", itemId: null })
      .where(eq(orderLines.id, fixture.lineId));
    await db
      .update(orderLineAllocations)
      .set({ quantity: "0.080", unitCost: "10.000000" })
      .where(eq(orderLineAllocations.orderLineId, fixture.lineId));

    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "not_returnable",
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(await db.select().from(refundLineAllocations)).toEqual([
      expect.objectContaining({
        quantity: "0.040",
        unitCost: "10.000000",
        returnedBatchId: null,
      }),
    ]);
  });

  it("records a waste entry when an external product refund is not returnable", async () => {
    const fixture = await soldExternalOrder(authorization);

    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "مشروب مُعد ولا يصلح",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "not_returnable",
          },
        ],
      });

    expect(response.status).toBe(201);
    const waste = await db.select().from(wasteEntries);
    expect(waste).toHaveLength(1);
    expect(waste[0]).toMatchObject({
      targetType: "external_product",
      externalProductId: 9101,
      warehouse: "cafe",
      quantity: "1.000",
      totalCost: "1.00",
    });
    expect(waste[0].refundLineId).not.toBeNull();
  });

  it("restocks the ingredient when an external product refund returns to stock", async () => {
    const fixture = await soldExternalOrder(authorization);

    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "لم يُحضّر بعد",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });

    expect(response.status).toBe(201);
    // restocking creates a new FIFO batch for the returned ingredient quantity
    const restockMovements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "refund_return"));
    expect(restockMovements).toHaveLength(1);
    expect(restockMovements[0]).toMatchObject({
      itemId: fixture.ingredientId,
      warehouse: "cafe",
      quantity: "0.100",
    });
    const restockBatch = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, restockMovements[0].batchId!));
    expect(restockBatch[0]).toMatchObject({
      itemId: fixture.ingredientId,
      warehouse: "cafe",
      remainingQuantity: "0.100",
    });
    // no waste is recorded for a restocked refund
    expect(await db.select().from(wasteEntries)).toHaveLength(0);
  });
});
