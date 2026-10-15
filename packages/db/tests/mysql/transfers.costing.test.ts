import { beforeEach, it } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import { stockBatches, stockMovements } from "@cashier/db";
import { db } from "../support/api-setup.js";
import {
  app,
  buyIntomain,
  createItem,
  createRequest,
  receiveMainBatch,
  setupCafeSession,
} from "../support/transfers-fixtures.js";

let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  ({ adminAuthorization, cashierAuthorization } = await setupCafeSession());
});

describe("cafe transfer costing and direct transfers", () => {
  it("approves edited quantities and preserves every main FIFO batch cost in cafe stock", async () => {
    const itemId = await createItem();
    const firstBatchId = await receiveMainBatch(
      itemId,
      "2.000",
      "10.000000",
      new Date("2026-07-18T00:00:00.000Z"),
    );
    const secondBatchId = await receiveMainBatch(
      itemId,
      "3.000",
      "20.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const created = await createRequest(cashierAuthorization, itemId, 5);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 4 }] });

    expect(approved.status).toBe(201);
    expect(approved.body.transferId).toEqual(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );

    const [firstMainBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, firstBatchId));
    const [secondMainBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, secondBatchId));
    expect(firstMainBatch.remainingQuantity).toBe("0.000");
    expect(secondMainBatch.remainingQuantity).toBe("1.000");

    const cafeBatches = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.itemId, itemId),
          eq(stockBatches.warehouse, "cafe"),
        ),
      )
      .orderBy(stockBatches.id);
    expect(cafeBatches).toEqual([
      expect.objectContaining({
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "10.000000",
        sourceType: "transfer_in",
      }),
      expect.objectContaining({
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "20.000000",
        sourceType: "transfer_in",
      }),
    ]);

    const detail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(adminAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      requestId: created.body.id,
      createdByName: "كاشير",
      approvedByName: "مدير",
      totalCost: "60.00",
    });
    // the original request and its approval carry their own times
    expect(detail.body.requestCreatedAt).not.toBeNull();
    expect(detail.body.requestReviewedAt).not.toBeNull();
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        itemId,
        quantity: "2.000",
        unitCost: "10.000000",
        lineCost: "20.00",
        sourceBatchId: firstBatchId,
      }),
      expect.objectContaining({
        itemId,
        quantity: "2.000",
        unitCost: "20.000000",
        lineCost: "40.00",
        sourceBatchId: secondBatchId,
      }),
    ]);

    const cafeStock = await request(app())
      .get("/api/inventory/cafe/stock")
      .set(adminAuthorization);
    expect(cafeStock.body[0]).toMatchObject({
      itemId,
      quantity: "4.000",
      stockValue: "60.000000000",
    });
  });

  it("approves above the balance, taking main below zero at the last known cost", async () => {
    const itemId = await createItem();
    const batchId = await receiveMainBatch(
      itemId,
      "2.000",
      "10.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const created = await createRequest(cashierAuthorization, itemId, 3);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 3 }] });

    expect(approved.status).toBe(201);
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, batchId));
    expect(batch.remainingQuantity).toBe("0.000");
    const cafeBatches = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.itemId, itemId),
          eq(stockBatches.warehouse, "cafe"),
        ),
      )
      .orderBy(stockBatches.id);
    expect(cafeBatches).toEqual([
      expect.objectContaining({
        initialQuantity: "2.000",
        unitCost: "10.000000",
        sourceType: "transfer_in",
      }),
      expect.objectContaining({
        initialQuantity: "1.000",
        unitCost: "10.000000",
        sourceType: "transfer_in",
      }),
    ]);
    // the part with no main batch is recorded as a negative main movement
    const [mainDeficit] = await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.itemId, itemId),
          eq(stockMovements.warehouse, "main"),
          isNull(stockMovements.batchId),
        ),
      );
    expect(mainDeficit).toMatchObject({ quantity: "-1.000", batchId: null });

    const detail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({
      isNegativeStock: true,
      totalCost: "30.00",
    });
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        quantity: "2.000",
        unitCost: "10.000000",
        sourceBatchId: batchId,
      }),
      expect.objectContaining({
        quantity: "1.000",
        unitCost: "10.000000",
        sourceBatchId: null,
      }),
    ]);

    // a cashier may read the transfer but must never receive its costs
    const cashierDetail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(cashierAuthorization);
    expect(cashierDetail.status).toBe(200);
    expect(cashierDetail.body).not.toHaveProperty("totalCost");
    expect(cashierDetail.body.lines[0]).not.toHaveProperty("unitCost");
    expect(cashierDetail.body.lines[0]).not.toHaveProperty("lineCost");

    const cashierList = await request(app())
      .get("/api/transfers")
      .set(cashierAuthorization);
    expect(cashierList.status).toBe(200);
    expect(cashierList.body[0]).not.toHaveProperty("totalCost");
  });

  it("settles the main shortage on the next purchase without touching the transfer cost", async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      "2.000",
      "10.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const created = await createRequest(cashierAuthorization, itemId, 3);
    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 3 }] });
    expect(approved.status).toBe(201);

    await buyIntomain(adminAuthorization, itemId, 1, 25);

    const mainStock = await request(app())
      .get("/api/inventory/main/stock")
      .set(adminAuthorization);
    expect(mainStock.body[0]).toMatchObject({ itemId, quantity: "0.000" });

    const detail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(adminAuthorization);
    expect(detail.body.totalCost).toBe("30.00");
    expect(detail.body.lines[1]).toMatchObject({
      quantity: "1.000",
      unitCost: "10.000000",
    });
  });

  it("serializes simultaneous approvals so exactly one transfer commits", async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      "2.000",
      "10.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const created = await createRequest(cashierAuthorization, itemId, 1);
    const approve = () =>
      request(app())
        .post(`/api/transfers/requests/${created.body.id}/approve`)
        .set(adminAuthorization)
        .send({ lines: [{ itemId, quantity: 1 }] });

    const responses = await Promise.all([approve(), approve()]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const transfers = await request(app())
      .get("/api/transfers")
      .set(cashierAuthorization);
    expect(transfers.body).toHaveLength(1);
    const cafeStock = await request(app())
      .get("/api/inventory/cafe/stock")
      .set(cashierAuthorization);
    expect(cafeStock.body[0].quantity).toBe("1.000");
  });

  it("rejects approval when it omits an originally requested item", async () => {
    const firstItemId = await createItem("بن");
    const secondItemId = await createItem("سكر");
    await receiveMainBatch(
      firstItemId,
      "1.000",
      "10.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const created = await request(app())
      .post("/api/transfers/requests")
      .set(cashierAuthorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [
          { itemId: firstItemId, quantity: 1 },
          { itemId: secondItemId, quantity: 1 },
        ],
      });
    expect(created.status).toBe(201);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId: firstItemId, quantity: 1 }] });

    expect(approved.status).toBe(400);
    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body.status).toBe("pending");
  });

  it("allows admins to create direct transfers but rejects cashier access", async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      "2.000",
      "10.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const body = { notes: "تحويل مباشر", lines: [{ itemId, quantity: 1 }] };

    const forbidden = await request(app())
      .post("/api/transfers/direct")
      .set(cashierAuthorization)
      .send(body);
    expect(forbidden.status).toBe(403);

    const created = await request(app())
      .post("/api/transfers/direct")
      .set(adminAuthorization)
      .send(body);
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/transfers/${created.body.transferId}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      requestId: null,
      createdByName: "مدير",
      approvedByName: "مدير",
      notes: "تحويل مباشر",
    });
    // a direct transfer has no request, so it has no request times
    expect(detail.body.requestCreatedAt).toBeNull();
    expect(detail.body.requestReviewedAt).toBeNull();
  });

  it("reports large transfer costs without overflowing list calculations", async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      "100000000.000",
      "9999999999.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );

    const created = await request(app())
      .post("/api/transfers/direct")
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 100000000 }] });
    expect(created.status).toBe(201);

    const list = await request(app())
      .get("/api/transfers")
      .set(adminAuthorization);
    expect(list.status).toBe(200);
    expect(list.body[0].totalCost).toBe("999999999900000000.00");
  });

  it("reconciles the total with individually rounded half-cent allocations", async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      "1.000",
      "0.005000",
      new Date("2026-07-18T00:00:00.000Z"),
    );
    await receiveMainBatch(
      itemId,
      "1.000",
      "0.005000",
      new Date("2026-07-19T00:00:00.000Z"),
    );

    const created = await request(app())
      .post("/api/transfers/direct")
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 2 }] });
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/transfers/${created.body.transferId}`)
      .set(adminAuthorization);
    expect(
      detail.body.lines.map((line: { lineCost: string }) => line.lineCost),
    ).toEqual(["0.01", "0.01"]);
    expect(detail.body.totalCost).toBe("0.02");
  });
});
