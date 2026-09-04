import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../src/app.js";
import {
  categories,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  refundLineAllocations,
  stockBatches,
  stockMovements,
  users,
} from "../../../src/db/schema.js";
import { appOptions, db, nextTestItemCode } from "../../support/setup.js";
import { createUser, loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let authorization: { readonly Authorization: string };

beforeEach(async () => {
  authorization = await loginAs(app(), "cashier");
  await request(app())
    .post("/api/shifts/open")
    .set(authorization)
    .send({ openingFloat: 100 });
});

async function soldResaleOrder() {
  const [cashier] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "cashier"));
  const [category] = await db.insert(categories).values({ name: "مياه" });
  const [item] = await db.insert(items).values({
    code: nextTestItemCode(),
    name: "مياه",
    categoryId: category.insertId,
    type: "resale",
    stockUnit: "قطعة",
    sellingPrice: "10.00",
  });
  const shift = (
    await request(app()).get("/api/shifts/current").set(authorization)
  ).body;
  const [order] = await db.insert(orders).values({
    orderNumber: `TEST-${Date.now()}`,
    clientRequestId: crypto.randomUUID(),
    requestFingerprint: "a".repeat(64),
    cashierId: cashier.id,
    shiftId: shift.id,
    subtotal: "20.00",
    discountType: "fixed",
    discountValue: "2.00",
    discountAmount: "2.00",
    total: "18.00",
    cashReceived: "20.00",
    changeAmount: "2.00",
    totalCost: "6.00",
  });
  const [line] = await db.insert(orderLines).values({
    orderId: order.insertId,
    type: "item",
    itemId: item.insertId,
    productName: "مياه",
    quantity: "2.000",
    unitPrice: "10.00",
    lineSubtotal: "20.00",
    totalCost: "6.00",
  });
  const [sourceBatch] = await db.insert(stockBatches).values({
    itemId: item.insertId,
    warehouse: "cafe",
    initialQuantity: "10.000",
    remainingQuantity: "8.000",
    unitCost: "3.000000",
    receivedAt: new Date(),
    sourceType: "transfer_in",
  });
  const [saleMovement] = await db.insert(stockMovements).values({
    itemId: item.insertId,
    warehouse: "cafe",
    batchId: sourceBatch.insertId,
    movementType: "sale",
    quantity: "-2.000",
    unitCost: "3.000000",
    referenceType: "order",
    referenceId: order.insertId,
    occurredAt: new Date(),
  });
  await db.insert(orderLineAllocations).values({
    orderLineId: line.insertId,
    itemId: item.insertId,
    itemName: "مياه",
    batchId: sourceBatch.insertId,
    stockMovementId: saleMovement.insertId,
    quantity: "2.000",
    unitCost: "3.000000",
  });
  return { orderId: order.insertId, lineId: line.insertId };
}

describe("refunds", () => {
  it("partially refunds the discounted cash amount and restores resale stock at original cost", async () => {
    const fixture = await soldResaleOrder();
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

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      orderId: fixture.orderId,
      amount: "9.00",
      totalCostReturned: "3.00",
      lines: [
        {
          orderLineId: fixture.lineId,
          quantity: "1.000",
          refundAmount: "9.00",
          stockAction: "return_to_stock",
          returnedCost: "3.00",
        },
      ],
    });
    const shift = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    expect(shift.totals.refunds).toBe("9.00");
    const refundable = await request(app())
      .get(`/api/refunds/order/${fixture.orderId}/quantities`)
      .set(authorization);
    expect(refundable.body).toEqual([
      { orderLineId: fixture.lineId, refundedQuantity: "1.000" },
    ]);
  });

  it("rejects cumulative quantities above the sold amount", async () => {
    const fixture = await soldResaleOrder();
    const body = {
      clientRequestId: crypto.randomUUID(),
      orderId: fixture.orderId,
      reason: "طلب العميل",
      lines: [
        {
          orderLineId: fixture.lineId,
          quantity: 2,
          stockAction: "not_returnable",
        },
      ],
    };
    expect(
      (await request(app()).post("/api/refunds").set(authorization).send(body))
        .status,
    ).toBe(201);
    body.clientRequestId = crypto.randomUUID();
    expect(
      (await request(app()).post("/api/refunds").set(authorization).send(body))
        .status,
    ).toBe(409);
  });

  it("never over-refunds discounted thirds and replays the same client request", async () => {
    const fixture = await soldResaleOrder();
    await db
      .update(orders)
      .set({ subtotal: "1.00", discountAmount: "0.00", total: "1.00" })
      .where(eq(orders.id, fixture.orderId));
    await db
      .update(orderLines)
      .set({
        quantity: "3.000",
        unitPrice: "0.33",
        lineSubtotal: "1.00",
        totalCost: "9.00",
      })
      .where(eq(orderLines.id, fixture.lineId));
    await db
      .update(orderLineAllocations)
      .set({ quantity: "3.000" })
      .where(eq(orderLineAllocations.orderLineId, fixture.lineId));

    const amounts: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const clientRequestId = crypto.randomUUID();
      const body = {
        clientRequestId,
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: fixture.lineId,
            quantity: 1,
            stockAction: "not_returnable",
          },
        ],
      };
      const response = await request(app())
        .post("/api/refunds")
        .set(authorization)
        .send(body);
      expect(response.status).toBe(201);
      amounts.push(Number(response.body.amount));
      if (index === 0) {
        const replay = await request(app())
          .post("/api/refunds")
          .set(authorization)
          .send(body);
        expect(replay.status).toBe(201);
        expect(replay.body.id).toBe(response.body.id);

        const changedPayload = await request(app())
          .post("/api/refunds")
          .set(authorization)
          .send({ ...body, reason: "سبب مختلف" });
        expect(changedPayload.status).toBe(409);

        const credentials = await createUser("cashier", "other-cashier");
        const login = await request(app())
          .post("/api/auth/login")
          .send(credentials);
        const otherCashier = {
          Authorization: `Bearer ${login.body.token}`,
        };
        const changedCashier = await request(app())
          .post("/api/refunds")
          .set(otherCashier)
          .send(body);
        expect(changedCashier.status).toBe(409);
      }
    }
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(1);
  });

  it("rejects refund creation without an open shift", async () => {
    const fixture = await soldResaleOrder();
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

  it("maps repeated partial stock returns exactly across original sale allocations", async () => {
    const fixture = await soldResaleOrder();
    const [first] = await db
      .select()
      .from(orderLineAllocations)
      .where(eq(orderLineAllocations.orderLineId, fixture.lineId));
    await db
      .update(orderLines)
      .set({ quantity: "3.000", lineSubtotal: "30.00", totalCost: "9.00" })
      .where(eq(orderLines.id, fixture.lineId));
    await db
      .update(orders)
      .set({ subtotal: "30.00", discountAmount: "0.00", total: "30.00" })
      .where(eq(orders.id, fixture.orderId));
    await db
      .update(orderLineAllocations)
      .set({ quantity: "2.000" })
      .where(eq(orderLineAllocations.id, first.id));
    const [secondMovement] = await db.insert(stockMovements).values({
      itemId: first.itemId,
      warehouse: "cafe",
      batchId: first.batchId,
      movementType: "sale",
      quantity: "-1.000",
      unitCost: "3.000000",
      referenceType: "order",
      referenceId: fixture.orderId,
      occurredAt: new Date(),
    });
    const [second] = await db.insert(orderLineAllocations).values({
      orderLineId: fixture.lineId,
      itemId: first.itemId,
      itemName: first.itemName,
      batchId: first.batchId,
      stockMovementId: secondMovement.insertId,
      quantity: "1.000",
      unitCost: "3.000000",
    });

    for (let index = 0; index < 3; index += 1) {
      const response = await request(app())
        .post("/api/refunds")
        .set(authorization)
        .send({
          clientRequestId: crypto.randomUUID(),
          orderId: fixture.orderId,
          reason: "صالح للبيع",
          lines: [
            {
              orderLineId: fixture.lineId,
              quantity: 1,
              stockAction: "return_to_stock",
            },
          ],
        });
      expect(response.status).toBe(201);
    }
    const allocations = await db.select().from(refundLineAllocations);
    const quantityFor = (id: number) =>
      allocations
        .filter((row) => row.orderLineAllocationId === id)
        .reduce((sum, row) => sum + Number(row.quantity), 0);
    expect(quantityFor(first.id)).toBe(2);
    expect(quantityFor(second.insertId)).toBe(1);
  });

  it("rejects fractional recipe-product refunds", async () => {
    const fixture = await soldResaleOrder();
    await db
      .update(orderLines)
      .set({ type: "recipe", itemId: null, quantity: "1.000" })
      .where(eq(orderLines.id, fixture.lineId));
    const response = await request(app())
      .post("/api/refunds")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: fixture.orderId,
        reason: "طلب العميل",
        lines: [{ orderLineId: fixture.lineId, quantity: 0.5 }],
      });
    expect(response.status).toBe(400);
  });

  it("uses the sale allocation snapshot when refunding an external product", async () => {
    const fixture = await soldResaleOrder();
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
        lines: [{ orderLineId: fixture.lineId, quantity: 1 }],
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
});
