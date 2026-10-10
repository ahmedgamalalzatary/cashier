import { expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  categories,
  recipes,
  recipeSizes,
  orderLines,
  orders,
  syncOutbox,
  users,
} from "@cashier/db";
import { db } from "../support/api-setup.js";
import { it, testBranchValues } from "../support/ids.js";
import { RecipesRepository } from "../../../../apps/api/src/modules/recipes/recipes.repository.js";

it("captures cleared historical size references before recipe replacement deletes the size", async () => {
  const [category] = await db
    .insert(categories)
    .values(testBranchValues({ name: "Food" }))
    .$returningId();
  const [recipe] = await db
    .insert(recipes)
    .values(
      testBranchValues({
        name: "Recipe",
        type: "product",
        categoryId: category.id,
      }),
    )
    .$returningId();
  const [size] = await db
    .insert(recipeSizes)
    .values(testBranchValues({ recipeId: recipe.id, name: "Size" }))
    .$returningId();
  const [cashier] = await db
    .insert(users)
    .values(
      testBranchValues({
        name: "Cashier",
        username: "cashier",
        role: "cashier",
        passwordHash: "test-only",
      }),
    )
    .$returningId();
  const [order] = await db
    .insert(orders)
    .values(
      testBranchValues({
        orderNumber: "1",
        clientRequestId: "1",
        requestFingerprint: "1",
        cashierId: cashier.id,
        subtotal: "10.00",
        total: "10.00",
        cashReceived: "10.00",
        changeAmount: "0.00",
      }),
    )
    .$returningId();
  const [line] = await db
    .insert(orderLines)
    .values(
      testBranchValues({
        orderId: order.id,
        type: "recipe",
        recipeId: recipe.id,
        recipeSizeId: size.id,
        productName: "Sold recipe",
        quantity: "1.000",
        unitPrice: "10.00",
        lineSubtotal: "10.00",
      }),
    )
    .$returningId();
  await db.delete(syncOutbox);
  await new RecipesRepository(db).transaction((repo) =>
    repo.deleteRecipeChildren(recipe.id),
  );
  const captured = await db.select().from(syncOutbox).orderBy(syncOutbox.seq);
  expect(captured.map((row) => [row.tableName, row.op])).toEqual([
    ["order_lines", "upsert"],
    ["recipe_sizes", "delete"],
  ]);
  expect(captured[0].rowJson).toMatchObject({
    id: line.id,
    recipe_size_id: null,
    product_name: "Sold recipe",
  });
  expect(
    (await db.select().from(orderLines).where(eq(orderLines.id, line.id)))[0]
      .recipeSizeId,
  ).toBeNull();
});
