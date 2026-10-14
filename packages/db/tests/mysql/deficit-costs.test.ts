import { beforeEach, it, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  items,
  orderLines,
  orders,
  refundLineAllocations,
  refunds,
  stockBatches,
  suppliers,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);
let admin: { readonly Authorization: string };
let cashier: { readonly Authorization: string };

beforeEach(async () => {
  admin = await loginAs(app(), "admin");
  cashier = await loginAs(app(), "cashier");
  await request(app()).post("/api/shifts/open").set(cashier).send({ openingFloat: 100 });
});

async function resaleItem() {
  const [category] = await db.insert(categories).values(testBranchValues({ name: "مياه" })).$returningId();
  const [item] = await db.insert(items).values(testBranchValues({
    code: nextTestItemCode(),
    name: "مياه",
    categoryId: category.id,
    type: "resale",
    stockUnit: "قطعة",
    sellingPrice: "10.00",
  })).$returningId();
  return item.id;
}

function sell(itemId: string, quantity: number) {
  return request(app())
    .post("/api/orders")
    .set(cashier)
    .send({
      clientRequestId: crypto.randomUUID(),
      lines: [{ type: "item", itemId, quantity }],
      discount: null,
      cashReceived: 100,
    });
}

/** Buys `quantity` at `unitPrice` and sends `toCafe` of it to the cafe. */
async function buy(itemId: string, quantity: number, unitPrice: number, toCafe: number) {
  const [supplier] = await db.insert(suppliers).values(testBranchValues({ name: "مورد" })).$returningId();
  const response = await request(app())
    .post("/api/purchases")
    .set(admin)
    .send({
      clientRequestId: crypto.randomUUID(),
      supplierId: supplier.id,
      invoiceNumber: null,
      purchasedAt: "2026-07-20",
      paidAmount: 0,
      notes: null,
      lines: [{ itemId, quantity, unitMode: "stock", unitPrice, toCafeQuantity: toCafe }],
    });
  expect(response.status).toBe(201);
}

describe("sales made before stock arrived", () => {
  it("get their real cost once stock settles them", async () => {
    const itemId = await resaleItem();
    await buy(itemId, 1, 3, 1);
    // 1 from stock @3, 2 with no stock
    const order = await sell(itemId, 3);
    expect(order.status).toBe(201);
    const [before] = await db.select().from(orders).where(eq(orders.id, order.body.id));
    expect(before.totalCost).toBe("3.00");

    await buy(itemId, 1, 4, 1); // settles 1 @4
    await buy(itemId, 5, 5, 5); // settles the last 1 @5

    const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, order.body.id));
    const [after] = await db.select().from(orders).where(eq(orders.id, order.body.id));
    expect(line.totalCost).toBe("12.00");
    expect(after.totalCost).toBe("12.00");
    // still remembered as a negative-stock sale
    expect(after.isNegativeStock).toBe(true);
  });

  it("refunds them back to stock at their real cost", async () => {
    const itemId = await resaleItem();
    const order = await sell(itemId, 2);
    await buy(itemId, 4, 6, 4); // settles both @6

    const refund = await request(app())
      .post("/api/refunds")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: order.body.id,
        reason: "طلب العميل",
        lines: [{ orderLineId: order.body.lines[0].id, quantity: 1, stockAction: "return_to_stock" }],
      });

    expect(refund.status).toBe(201);
    const [stored] = await db.select().from(refunds).where(eq(refunds.id, refund.body.id));
    expect(stored.totalCostReturned).toBe("6.00");
    const [returned] = await db.select().from(refundLineAllocations);
    expect(returned.unitCost).toBe("6.000000");
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, returned.returnedBatchId!));
    expect(batch).toMatchObject({ sourceType: "refund_return", unitCost: "6.000000" });
  });
});
