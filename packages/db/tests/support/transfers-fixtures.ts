import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  items,
  stockBatches,
  stockMovements,
  suppliers,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "./api-setup.js";
import { createUser, loginAs } from "./api-helpers.js";
import { testBranchValues } from "./ids.js";

export const app = () => createApp(db, appOptions);

/**
 * Logs in the branch's admin and cashier and opens the cashier's shift, the
 * baseline every transfer test builds on.
 */
export async function setupCafeSession() {
  const adminAuthorization = await loginAs(app(), "admin");
  const cashierAuthorization = await loginAs(app(), "cashier");
  const opened = await request(app())
    .post("/api/shifts/open")
    .set(cashierAuthorization)
    .send({ openingFloat: 0 });
  return {
    adminAuthorization,
    cashierAuthorization,
    openedShiftId: opened.body.id as string,
  };
}

/** A second cashier in the same branch, used to prove shared request visibility. */
export async function loginSecondCashier() {
  const credentials = await createUser("cashier", "cashier-two");
  const response = await request(app())
    .post("/api/auth/login")
    .send(credentials);
  return { Authorization: `Bearer ${response.body.token}` } as const;
}

export async function createItem(name = "بن") {
  const [category] = await db
    .insert(categories)
    .values(testBranchValues({ name: "خامات" }))
    .$returningId();
  const [item] = await db
    .insert(items)
    .values(
      testBranchValues({
        code: nextTestItemCode(),
        name,
        categoryId: category.id,
        type: "raw",
        stockUnit: "كجم",
      }),
    )
    .$returningId();
  return item.id;
}

export async function receiveMainBatch(
  itemId: string,
  quantity: string,
  unitCost: string,
  receivedAt: Date,
) {
  const [batch] = await db
    .insert(stockBatches)
    .values(
      testBranchValues({
        itemId,
        warehouse: "main",
        initialQuantity: quantity,
        remainingQuantity: quantity,
        unitCost,
        receivedAt,
        sourceType: "purchase",
      }),
    )
    .$returningId();
  await db.insert(stockMovements).values(
    testBranchValues({
      itemId,
      warehouse: "main",
      batchId: batch.id,
      movementType: "purchase",
      quantity,
      unitCost,
      occurredAt: receivedAt,
    }),
  );
  return batch.id;
}

export async function createRequest(
  authorization: { readonly Authorization: string },
  itemId: string,
  quantity = 1,
) {
  return request(app())
    .post("/api/transfers/requests")
    .set(authorization)
    .send({
      clientRequestId: crypto.randomUUID(),
      notes: "احتياج الوردية",
      lines: [{ itemId, quantity }],
    });
}

/** Buys `quantity` of an item at `unitPrice` straight into the main warehouse. */
export async function buyIntomain(
  authorization: { readonly Authorization: string },
  itemId: string,
  quantity: number,
  unitPrice: number,
) {
  const [supplier] = await db
    .insert(suppliers)
    .values(testBranchValues({ name: "مورد" }))
    .$returningId();
  const response = await request(app())
    .post("/api/purchases")
    .set(authorization)
    .send({
      clientRequestId: crypto.randomUUID(),
      supplierId: supplier.id,
      invoiceNumber: null,
      purchasedAt: "2026-07-21",
      paidAmount: 0,
      notes: null,
      lines: [
        { itemId, quantity, unitMode: "stock", unitPrice, toCafeQuantity: 0 },
      ],
    });
  expect(response.status).toBe(201);
}
