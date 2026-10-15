import { createApp } from "../../../../apps/api/src/app.js";
import { categories, items, suppliers } from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "./api-setup.js";
import { testBranchValues } from "./ids.js";

export const app = () => createApp(db, appOptions);

export async function createPurchaseFixture() {
  const [supplierResult] = await db
    .insert(suppliers)
    .values(testBranchValues({ name: "مورد البن" }))
    .$returningId();
  const [categoryResult] = await db
    .insert(categories)
    .values(testBranchValues({ name: "خامات" }))
    .$returningId();
  const [itemResult] = await db
    .insert(items)
    .values(
      testBranchValues({
        code: nextTestItemCode(),
        name: "بن",
        categoryId: categoryResult.id,
        type: "raw",
        stockUnit: "كجم",
        purchaseUnit: "شيكارة",
        purchaseToStockFactor: "25.000000",
      }),
    )
    .$returningId();
  return {
    supplierId: supplierResult.id,
    itemId: itemResult.id,
  };
}
