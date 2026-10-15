import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  externalCategories,
  externalProducts,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  stockBatches,
  stockMovements,
  users,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "./api-setup.js";
import { loginAs } from "./api-helpers.js";
import { testBranchValues } from "./ids.js";

export const app = () => createApp(db, appOptions);

/** Logs in the branch's cashier and admin and opens the cashier's shift. */
export async function setupRefundSession() {
  const authorization = await loginAs(app(), "cashier");
  const adminAuthorization = await loginAs(app(), "admin");
  await request(app())
    .post("/api/shifts/open")
    .set(authorization)
    .send({ openingFloat: 100 });
  return { authorization, adminAuthorization };
}

export async function soldResaleOrder(authorization: {
  readonly Authorization: string;
}) {
  const [cashier] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "cashier"));
  const [category] = await db
    .insert(categories)
    .values(testBranchValues({ name: "مياه" }))
    .$returningId();
  const [item] = await db
    .insert(items)
    .values(
      testBranchValues({
        code: nextTestItemCode(),
        name: "مياه",
        categoryId: category.id,
        type: "resale",
        stockUnit: "قطعة",
        sellingPrice: "10.00",
      }),
    )
    .$returningId();
  const shift = (
    await request(app()).get("/api/shifts/current").set(authorization)
  ).body;
  const [order] = await db
    .insert(orders)
    .values(
      testBranchValues({
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
      }),
    )
    .$returningId();
  const [line] = await db
    .insert(orderLines)
    .values(
      testBranchValues({
        orderId: order.id,
        type: "item",
        itemId: item.id,
        productName: "مياه",
        quantity: "2.000",
        unitPrice: "10.00",
        lineSubtotal: "20.00",
        totalCost: "6.00",
      }),
    )
    .$returningId();
  const [sourceBatch] = await db
    .insert(stockBatches)
    .values(
      testBranchValues({
        itemId: item.id,
        warehouse: "cafe",
        initialQuantity: "10.000",
        remainingQuantity: "8.000",
        unitCost: "3.000000",
        receivedAt: new Date(),
        sourceType: "transfer_in",
      }),
    )
    .$returningId();
  const [saleMovement] = await db
    .insert(stockMovements)
    .values(
      testBranchValues({
        itemId: item.id,
        warehouse: "cafe",
        batchId: sourceBatch.id,
        movementType: "sale",
        quantity: "-2.000",
        unitCost: "3.000000",
        referenceType: "order",
        referenceId: order.id,
        occurredAt: new Date(),
      }),
    )
    .$returningId();
  await db.insert(orderLineAllocations).values(
    testBranchValues({
      orderLineId: line.id,
      itemId: item.id,
      itemName: "مياه",
      batchId: sourceBatch.id,
      stockMovementId: saleMovement.id,
      quantity: "2.000",
      unitCost: "3.000000",
    }),
  );
  return { orderId: order.id, lineId: line.id };
}

export async function soldExternalOrder(authorization: {
  readonly Authorization: string;
}) {
  const [cashier] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "cashier"));
  await db
    .insert(externalCategories)
    .values(
      testBranchValues({
        externalId: 9001,
        nameAr: "مشروبات",
        nameEn: "Drinks",
        isActive: true,
        isVisible: true,
        displayOrder: 0,
        syncedAt: new Date(),
      }),
    )
    .onDuplicateKeyUpdate({ set: { nameAr: "مشروبات" } });
  await db
    .insert(externalProducts)
    .values(
      testBranchValues({
        externalId: 9101,
        externalCategoryId: 9001,
        nameAr: "لاتيه",
        nameEn: "Latte",
        price: "20.00",
        calories: 0,
        pointsReward: 0,
        isAvailable: true,
        isVisible: true,
        syncedAt: new Date(),
      }),
    )
    .onDuplicateKeyUpdate({ set: { nameAr: "لاتيه" } });
  const [ingredientCategory] = await db
    .insert(categories)
    .values(testBranchValues({ name: "خامات" }))
    .$returningId();
  const [ingredient] = await db
    .insert(items)
    .values(
      testBranchValues({
        code: nextTestItemCode(),
        name: "حليب",
        categoryId: ingredientCategory.id,
        type: "raw",
        stockUnit: "لتر",
      }),
    )
    .$returningId();
  const shift = (
    await request(app()).get("/api/shifts/current").set(authorization)
  ).body;
  const [order] = await db
    .insert(orders)
    .values(
      testBranchValues({
        orderNumber: `TEST-${Date.now()}`,
        clientRequestId: crypto.randomUUID(),
        requestFingerprint: "b".repeat(64),
        cashierId: cashier.id,
        shiftId: shift.id,
        subtotal: "20.00",
        discountAmount: "0.00",
        total: "20.00",
        cashReceived: "20.00",
        changeAmount: "0.00",
        totalCost: "1.00",
      }),
    )
    .$returningId();
  const [line] = await db
    .insert(orderLines)
    .values(
      testBranchValues({
        orderId: order.id,
        type: "external_product",
        externalProductId: 9101,
        productName: "لاتيه",
        quantity: "1.000",
        unitPrice: "20.00",
        lineSubtotal: "20.00",
        totalCost: "1.00",
      }),
    )
    .$returningId();
  const [sourceBatch] = await db
    .insert(stockBatches)
    .values(
      testBranchValues({
        itemId: ingredient.id,
        warehouse: "cafe",
        initialQuantity: "5.000",
        remainingQuantity: "4.900",
        unitCost: "10.000000",
        receivedAt: new Date(),
        sourceType: "transfer_in",
      }),
    )
    .$returningId();
  const [saleMovement] = await db
    .insert(stockMovements)
    .values(
      testBranchValues({
        itemId: ingredient.id,
        warehouse: "cafe",
        batchId: sourceBatch.id,
        movementType: "sale",
        quantity: "-0.100",
        unitCost: "10.000000",
        referenceType: "order",
        referenceId: order.id,
        occurredAt: new Date(),
      }),
    )
    .$returningId();
  await db.insert(orderLineAllocations).values(
    testBranchValues({
      orderLineId: line.id,
      itemId: ingredient.id,
      itemName: "حليب",
      batchId: sourceBatch.id,
      stockMovementId: saleMovement.id,
      quantity: "0.100",
      unitCost: "10.000000",
    }),
  );
  return {
    orderId: order.id,
    lineId: line.id,
    ingredientId: ingredient.id,
    batchId: sourceBatch.id,
  };
}
