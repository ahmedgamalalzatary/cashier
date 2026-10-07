import { beforeEach, it, testId, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  items,
  purchaseInvoices,
  stockDeficitAllocations,
  stockBatches,
  stockMovements,
  supplierPayments,
  suppliers,
  transferLines,
  transfers,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);
let authorization: { readonly Authorization: string };

beforeEach(async () => {
  authorization = await loginAs(app(), "admin");
});

async function createPurchaseFixture() {
  const [supplierResult] = await db.insert(suppliers).values(testBranchValues({
    name: "مورد البن",
  })).$returningId();
  const [categoryResult] = await db.insert(categories).values(testBranchValues({
    name: "خامات",
  })).$returningId();
  const [itemResult] = await db.insert(items).values(testBranchValues({
    code: nextTestItemCode(),
    name: "بن",
    categoryId: categoryResult.id,
    type: "raw",
    stockUnit: "كجم",
    purchaseUnit: "شيكارة",
    purchaseToStockFactor: "25.000000",
  })).$returningId();
  return {
    supplierId: supplierResult.id,
    itemId: itemResult.id,
  };
}

describe("purchase invoices", () => {
  it("confirms a purchase-unit line into a main-warehouse FIFO batch", async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        invoiceNumber: "INV-100",
        purchasedAt: "2026-07-19",
        paidAmount: 0,
        notes: "توريد أول المدة",
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 2,
            unitMode: "purchase",
            unitPrice: 300,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toEqual(expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));

    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.sourceId, response.body.id));
    expect(batch).toMatchObject({
      itemId: fixture.itemId,
      warehouse: "main",
      initialQuantity: "50.000",
      remainingQuantity: "50.000",
      unitCost: "12.000000",
      sourceType: "purchase",
    });

    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, response.body.id));
    expect(movement).toMatchObject({
      batchId: batch.id,
      movementType: "purchase",
      quantity: "50.000",
      referenceType: "purchase_invoice",
    });
  });

  it("records a partial payment and exposes invoice details and supplier running balance", async () => {
    const fixture = await createPurchaseFixture();

    const created = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        invoiceNumber: "INV-101",
        purchasedAt: "2026-07-20",
        paidAmount: 100,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 10,
            unitMode: "stock",
            unitPrice: 30,
          },
        ],
      });
    expect(created.status).toBe(201);

    const list = await request(app()).get("/api/purchases").set(authorization);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        supplierId: fixture.supplierId,
        supplierName: "مورد البن",
        invoiceNumber: "INV-101",
        totalAmount: "300.00",
        paidAmount: "100.00",
        dueAmount: "200.00",
      }),
    ]);

    const detail = await request(app())
      .get(`/api/purchases/${created.body.id}`)
      .set(authorization);
    expect(detail.status).toBe(200);
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        itemId: fixture.itemId,
        itemName: "بن",
        quantity: "10.000",
        unitMode: "stock",
        unitName: "كجم",
        stockQuantity: "10.000",
        stockUnit: "كجم",
        lineTotal: "300.00",
      }),
    ]);

    const suppliersList = await request(app())
      .get("/api/suppliers")
      .set(authorization);
    expect(suppliersList.body[0].balance).toBe("200.00");

    const statement = await request(app())
      .get(`/api/suppliers/${fixture.supplierId}/statement`)
      .set(authorization);
    expect(statement.status).toBe(200);
    expect(statement.body.movements).toEqual([
      expect.objectContaining({
        type: "purchase",
        referenceId: created.body.id,
        amount: "300.00",
        balanceAfter: "300.00",
      }),
      expect.objectContaining({
        type: "payment",
        amount: "-100.00",
        balanceAfter: "200.00",
      }),
    ]);
  });

  it("rejects a computed invoice total outside the money column range", async () => {
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
            quantity: 99_999_999_999,
            unitMode: "stock",
            unitPrice: 9_999_999_999,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("إجمالي");

    const batches = await db.select().from(stockBatches);
    expect(batches).toHaveLength(0);
  });

  it("keeps long invoice notes on the document without overflowing stock movements", async () => {
    const fixture = await createPurchaseFixture();
    const notes = "م".repeat(300);

    const response = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        notes,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(201);
    const detail = await request(app())
      .get(`/api/purchases/${response.body.id}`)
      .set(authorization);
    expect(detail.body.notes).toBe(notes);

    const [movement] = await db.select().from(stockMovements);
    expect(movement.notes).toBeNull();
  });

  it("rejects converted stock quantities outside the database range", async () => {
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
            quantity: 99_999_999_999.999,
            unitMode: "purchase",
            unitPrice: 0.01,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("الكمية");
    expect(await db.select().from(purchaseInvoices)).toHaveLength(0);
    expect(await db.select().from(stockBatches)).toHaveLength(0);
  });

  it("blocks opening-balance edits after a credit purchase", async () => {
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

    const changed = await request(app())
      .put(`/api/suppliers/${fixture.supplierId}`)
      .set(authorization)
      .send({ openingBalance: 50 });

    expect(changed.status).toBe(409);
  });

  it("settles an exact half-cent-rounded invoice in full", async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 4.02,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 0.005,
            unitMode: "stock",
            unitPrice: 803,
          },
        ],
      });

    expect(response.status).toBe(201);
    const detail = await request(app())
      .get(`/api/purchases/${response.body.id}`)
      .set(authorization);
    expect(detail.body).toMatchObject({
      totalAmount: "4.02",
      paidAmount: "4.02",
      dueAmount: "0.00",
    });
    const suppliersList = await request(app())
      .get("/api/suppliers")
      .set(authorization);
    expect(suppliersList.body[0].balance).toBe("0.00");
  });

  it("replays a concurrent double-submit of the same clientRequestId as one invoice", async () => {
    const fixture = await createPurchaseFixture();
    const body = {
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
    };

    // a double-tapped save sends the same key twice at the same moment
    const responses = await Promise.all([
      request(app()).post("/api/purchases").set(authorization).send(body),
      request(app()).post("/api/purchases").set(authorization).send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(responses[1].body.id).toBe(responses[0].body.id);
    // one invoice, one receipt, one stock movement — no double stock
    expect(await db.select().from(purchaseInvoices)).toHaveLength(1);
    expect(await db.select().from(stockBatches)).toHaveLength(1);
    expect(await db.select().from(stockMovements)).toHaveLength(1);
  });

  it("serializes concurrent duplicate invoice numbers for one supplier", async () => {
    const fixture = await createPurchaseFixture();
    const body = {
      clientRequestId: crypto.randomUUID(),
      supplierId: fixture.supplierId,
      invoiceNumber: "DUP-1",
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
    };

    const responses = await Promise.all([
      request(app()).post("/api/purchases").set(authorization).send(body),
      request(app())
        .post("/api/purchases")
        .set(authorization)
        .send({ ...body, clientRequestId: crypto.randomUUID() }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(1);
    expect(await db.select().from(stockBatches)).toHaveLength(1);
  });

  it("rolls back an overpaid invoice before creating financial or stock records", async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: fixture.supplierId,
        purchasedAt: "2026-07-20",
        paidAmount: 10.01,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(0);
    expect(await db.select().from(supplierPayments)).toHaveLength(0);
    expect(await db.select().from(stockBatches)).toHaveLength(0);
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it("allocates a purchase receipt against outstanding negative stock", async () => {
    const fixture = await createPurchaseFixture();
    const [deficit] = await db.insert(stockMovements).values(testBranchValues({
      itemId: fixture.itemId,
      warehouse: "main",
      batchId: null,
      movementType: "adjustment",
      quantity: "-2.000",
      unitCost: "0.000000",
      occurredAt: new Date("2026-07-19T00:00:00.000Z"),
    })).$returningId();

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
            quantity: 3,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(201);
    const [batch] = await db.select().from(stockBatches);
    expect(batch.remainingQuantity).toBe("1.000");
    const [allocation] = await db.select().from(stockDeficitAllocations);
    expect(allocation).toMatchObject({
      deficitMovementId: deficit.id,
      batchId: batch.id,
      quantity: "2.000",
      unitCost: "10.000000",
    });
  });

  it("replays the same clientRequestId without duplicating stock, and 409s on a changed payload", async () => {
    const fixture = await createPurchaseFixture();
    const body = {
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
    };

    const first = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send(body);
    expect(first.status).toBe(201);

    // a retry with the same key returns the original instead of double-creating
    const replay = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(1);
    expect(await db.select().from(stockBatches)).toHaveLength(1);

    // the same key with a different payload is a conflict, not a new invoice
    const changed = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({ ...body, paidAmount: 5 });
    expect(changed.status).toBe(409);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(1);
  });

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
        { warehouse: "main", remainingQuantity: "30.000", unitCost: "12.000000" },
        { warehouse: "cafe", remainingQuantity: "20.000", unitCost: "12.000000" },
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
      .where(and(eq(stockBatches.warehouse, "main"), eq(stockBatches.itemId, fixture.itemId)));
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

    const transferRows = await db.select().from(transfers).orderBy(transfers.id);
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
    const [category] = await db.insert(categories).values(testBranchValues({ name: "خامات" })).$returningId();
    const [otherItem] = await db.insert(items).values(testBranchValues({
      code: nextTestItemCode(),
      name: "سكر",
      categoryId: category.id,
      type: "raw",
      stockUnit: "كجم",
    })).$returningId();
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
          { itemId: otherItemId, quantity: 5, unitMode: "stock", unitPrice: 10 },
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
