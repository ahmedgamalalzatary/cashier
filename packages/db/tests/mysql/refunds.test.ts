import { beforeEach, it, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  orderLineAllocations,
  orderLines,
  orders,
  refundLineAllocations,
  refunds,
  stockMovements,
  wasteEntries,
} from "@cashier/db";
import { db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";
import {
  app,
  setupRefundSession,
  soldResaleOrder,
} from "../support/refunds-fixtures.js";

let authorization: { readonly Authorization: string };
// cost figures are admin-only (spec §2), so cost checks re-read as admin
let adminAuthorization: {
  readonly Authorization: string;
  readonly "X-Branch-Id": string;
};

beforeEach(async () => {
  ({ authorization, adminAuthorization } = await setupRefundSession());
});

describe("refunds", () => {
  it("partially refunds the discounted cash amount and restores resale stock at original cost", async () => {
    const fixture = await soldResaleOrder(authorization);
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
      lines: [
        {
          orderLineId: fixture.lineId,
          quantity: "1.000",
          refundAmount: "9.00",
          stockAction: "return_to_stock",
        },
      ],
    });
    // costs stay behind the cashier cut, admins still see them
    const asAdmin = await request(app())
      .get(`/api/refunds/${response.body.id}`)
      .set(adminAuthorization);
    expect(asAdmin.body.totalCostReturned).toBe("3.00");
    expect(asAdmin.body.lines[0].returnedCost).toBe("3.00");
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

  it("restocks a fully discounted sale with a zero-cash refund", async () => {
    const fixture = await soldResaleOrder(authorization);
    // 100% discount: the customer paid nothing, so the cash refund is zero
    await db
      .update(orders)
      .set({
        subtotal: "20.00",
        discountAmount: "20.00",
        total: "0.00",
        cashReceived: "0.00",
        changeAmount: "0.00",
      })
      .where(eq(orders.id, fixture.orderId));

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
      amount: "0.00",
      lines: [
        {
          orderLineId: fixture.lineId,
          quantity: "1.000",
          refundAmount: "0.00",
          stockAction: "return_to_stock",
        },
      ],
    });
    const asAdmin = await request(app())
      .get(`/api/refunds/${response.body.id}`)
      .set(adminAuthorization);
    expect(asAdmin.body.totalCostReturned).toBe("3.00");
    expect(asAdmin.body.lines[0].returnedCost).toBe("3.00");
    // the goods actually came back, as a refund return and not as waste
    const returns = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "refund_return"));
    expect(returns).toHaveLength(1);
    expect(returns[0].quantity).toBe("1.000");
    expect(await db.select().from(wasteEntries)).toHaveLength(0);
    const refundable = await request(app())
      .get(`/api/refunds/order/${fixture.orderId}/quantities`)
      .set(authorization);
    expect(refundable.body).toEqual([
      { orderLineId: fixture.lineId, refundedQuantity: "1.000" },
    ]);
  });

  it("rejects cumulative quantities above the sold amount", async () => {
    const fixture = await soldResaleOrder(authorization);
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

  it("replays a concurrent double-submit of the same clientRequestId as one refund", async () => {
    const fixture = await soldResaleOrder(authorization);
    const body = {
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
    };

    // a double-tapped save sends the same key twice at the same moment
    const responses = await Promise.all([
      request(app()).post("/api/refunds").set(authorization).send(body),
      request(app()).post("/api/refunds").set(authorization).send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(responses[1].body.id).toBe(responses[0].body.id);
    // one refund document and one stock return — cash and stock move once
    expect(await db.select().from(refunds)).toHaveLength(1);
    const returns = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "refund_return"));
    expect(returns).toHaveLength(1);
    expect(returns[0].quantity).toBe("1.000");
    const shift = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    expect(shift.totals.refunds).toBe("9.00");
  });

  it("rejects a concurrent refund of the same remaining unit from a different request", async () => {
    const fixture = await soldResaleOrder(authorization);
    await db
      .update(orderLines)
      .set({ quantity: "1.000", lineSubtotal: "10.00" })
      .where(eq(orderLines.id, fixture.lineId));
    await db
      .update(orderLineAllocations)
      .set({ quantity: "1.000" })
      .where(eq(orderLineAllocations.orderLineId, fixture.lineId));
    await db
      .update(orders)
      .set({ subtotal: "10.00", discountAmount: "0.00", total: "10.00" })
      .where(eq(orders.id, fixture.orderId));

    const send = () =>
      request(app())
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

    // two distinct requests racing for the single remaining unit
    const responses = await Promise.all([send(), send()]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await db.select().from(refunds)).toHaveLength(1);
    const returns = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "refund_return"));
    expect(returns).toHaveLength(1);
    expect(returns[0].quantity).toBe("1.000");
    const shift = (
      await request(app()).get("/api/shifts/current").set(authorization)
    ).body;
    expect(shift.totals.refunds).toBe("10.00");
  });

  it("never over-refunds discounted thirds and replays the same client request", async () => {
    const fixture = await soldResaleOrder(authorization);
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

  it("maps repeated partial stock returns exactly across original sale allocations", async () => {
    const fixture = await soldResaleOrder(authorization);
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
    const [secondMovement] = await db
      .insert(stockMovements)
      .values(
        testBranchValues({
          itemId: first.itemId,
          warehouse: "cafe",
          batchId: first.batchId,
          movementType: "sale",
          quantity: "-1.000",
          unitCost: "3.000000",
          referenceType: "order",
          referenceId: fixture.orderId,
          occurredAt: new Date(),
        }),
      )
      .$returningId();
    const [second] = await db
      .insert(orderLineAllocations)
      .values(
        testBranchValues({
          orderLineId: fixture.lineId,
          itemId: first.itemId,
          itemName: first.itemName,
          batchId: first.batchId,
          stockMovementId: secondMovement.id,
          quantity: "1.000",
          unitCost: "3.000000",
        }),
      )
      .$returningId();

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
    const quantityFor = (id: string) =>
      allocations
        .filter((row) => row.orderLineAllocationId === id)
        .reduce((sum, row) => sum + Number(row.quantity), 0);
    expect(quantityFor(first.id)).toBe(2);
    expect(quantityFor(second.id)).toBe(1);
  });

  it("rejects fractional recipe-product refunds", async () => {
    const fixture = await soldResaleOrder(authorization);
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
});
