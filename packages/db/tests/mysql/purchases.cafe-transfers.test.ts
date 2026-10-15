import { beforeEach, it, testId, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import {
  categories,
  items,
  purchaseInvoices,
  stockBatches,
  transferLines,
  transfers,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import { app, createPurchaseFixture } from "../support/purchases-fixtures.js";

let authorization: { readonly Authorization: string };

beforeEach(async () => {
  authorization = await loginAs(app(), "admin");
});

describe("purchase to-cafe transfers", () => {
  it("sends part of a line to the cafe in the same save, once even on replay", async () => {
    const fixture = await createPurchaseFixture();
    const body = {
      clientRequestId: crypto.randomUUID(),
      supplierId: fixture.supplierId,
      purchasedAt: "2026-07-20",
      paidAmount: 0,
      lines: [
        {
          itemId: fixture.itemId,
          quantity: 2,
          unitMode: "purchase",
          unitPrice: 300,
          toCafeQuantity: 20,
        },
      ],
    };

    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send(body);
    expect(created.status).toBe(201);
    const replay = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send(body);
    expect(replay.body.id).toBe(created.body.id);

    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.itemId, fixture.itemId));
    expect(
      batches.map(({ warehouse, remainingQuantity, unitCost }) => ({
        warehouse,
        remainingQuantity,
        unitCost,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          warehouse: "main",
          remainingQuantity: "30.000",
          unitCost: "12.000000",
        },
        {
          warehouse: "cafe",
          remainingQuantity: "20.000",
          unitCost: "12.000000",
        },
      ]),
    );
    expect(batches).toHaveLength(2);

    const transferRows = await db.select().from(transfers);
    expect(transferRows).toHaveLength(1);
    expect(transferRows[0]).toMatchObject({ requestId: null });
    expect(transferRows[0].notes).toContain(`#${created.body.id}`);
    const lines = await db.select().from(transferLines);
    expect(lines).toEqual([
      expect.objectContaining({
        transferId: transferRows[0].id,
        itemId: fixture.itemId,
        quantity: "20.000",
      }),
    ]);

    const changed = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        ...body,
        lines: [{ ...body.lines[0], toCafeQuantity: 10 }],
      });
    expect(changed.status).toBe(409);
  });

  it("links a cafe transfer on save to its invoice and reports what left the invoice", async () => {
    const fixture = await createPurchaseFixture();

    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 2,
            unitMode: "purchase",
            unitPrice: 300,
            toCafeQuantity: 20,
          },
        ],
      });
    expect(created.status).toBe(201);

    const transferRows = await db.select().from(transfers);
    expect(transferRows).toHaveLength(1);
    expect(transferRows[0].purchaseInvoiceId).toBe(created.body.id);

    const detail = await request(app())
      .get(`/api/purchases/${created.body.id}`)
      .set(authorization);
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        itemId: fixture.itemId,
        stockQuantity: "50.000",
        transferredToCafeQuantity: "20.000",
      }),
    ]);
  });

  it("reports no transferred quantity for an invoice that stayed whole", async () => {
    const fixture = await createPurchaseFixture();

    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/purchases/${created.body.id}`)
      .set(authorization);
    expect(detail.body.lines[0].transferredToCafeQuantity).toBe("0.000");
    expect(await db.select().from(transfers)).toEqual([]);
  });

  it("rejects a direct transfer above what the invoice still owes the cafe", async () => {
    const fixture = await createPurchaseFixture();
    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });
    expect(created.status).toBe(201);

    const tooMuch = await request(app())
      .post("/api/transfers/direct")
      .set(authorization)
      .send({
        purchaseInvoiceId: created.body.id,
        lines: [{ itemId: fixture.itemId, quantity: 1.001 }],
      });

    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toContain("فاتورة");
    expect(await db.select().from(transfers)).toEqual([]);
    const [mainBatch] = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.warehouse, "main"),
          eq(stockBatches.itemId, fixture.itemId),
        ),
      );
    expect(mainBatch.remainingQuantity).toBe("1.000");
  });

  it("accepts a direct transfer of the invoice remainder and then refuses a second one", async () => {
    const fixture = await createPurchaseFixture();
    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
            toCafeQuantity: 0.4,
          },
        ],
      });
    expect(created.status).toBe(201);

    // 1 bought - 0.4 already sent on save leaves 0.6 to transfer
    const direct = await request(app())
      .post("/api/transfers/direct")
      .set(authorization)
      .send({
        purchaseInvoiceId: created.body.id,
        lines: [{ itemId: fixture.itemId, quantity: 0.6 }],
      });
    expect(direct.status).toBe(201);

    const transferRows = await db
      .select()
      .from(transfers)
      .orderBy(transfers.id);
    expect(transferRows).toHaveLength(2);
    expect(transferRows[1].purchaseInvoiceId).toBe(created.body.id);

    const detail = await request(app())
      .get(`/api/purchases/${created.body.id}`)
      .set(authorization);
    expect(detail.body.lines[0].transferredToCafeQuantity).toBe("1.000");

    const exhausted = await request(app())
      .post("/api/transfers/direct")
      .set(authorization)
      .send({
        purchaseInvoiceId: created.body.id,
        lines: [{ itemId: fixture.itemId, quantity: 0.001 }],
      });
    expect(exhausted.status).toBe(409);
    expect(await db.select().from(transfers)).toHaveLength(2);
  });

  it("rejects a direct transfer naming an unknown or foreign-branch invoice", async () => {
    const fixture = await createPurchaseFixture();

    const unknown = await request(app())
      .post("/api/transfers/direct")
      .set(authorization)
      .send({
        purchaseInvoiceId: testId(999999),
        lines: [{ itemId: fixture.itemId, quantity: 1 }],
      });
    expect(unknown.status).toBe(404);
    expect(await db.select().from(transfers)).toEqual([]);
  });

  it("rejects a direct transfer naming an item the invoice never bought", async () => {
    const fixture = await createPurchaseFixture();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "خامات" }))
      .$returningId();
    const [otherItem] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "سكر",
          categoryId: category.id,
          type: "raw",
          stockUnit: "كجم",
        }),
      )
      .$returningId();
    const otherItemId = otherItem.id;
    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });
    expect(created.status).toBe(201);

    // the other item has real main stock, so without invoice scoping the
    // transfer below would simply succeed
    await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: otherItemId,
            quantity: 5,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });

    const foreignItem = await request(app())
      .post("/api/transfers/direct")
      .set(authorization)
      .send({
        purchaseInvoiceId: created.body.id,
        lines: [{ itemId: otherItemId, quantity: 1 }],
      });

    expect(foreignItem.status).toBe(409);
    expect(await db.select().from(transfers)).toEqual([]);
  });

  it("rejects a to-cafe quantity above the received stock quantity and saves nothing", async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "purchase",
            unitPrice: 300,
            toCafeQuantity: 25.001,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(0);
    expect(await db.select().from(stockBatches)).toHaveLength(0);
    expect(await db.select().from(transfers)).toHaveLength(0);
  });
});
