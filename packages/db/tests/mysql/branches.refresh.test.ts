import { it, testId } from "../support/ids.js";
import request from "supertest";
import { ProductsRepository } from "../../../../apps/api/src/modules/products/products.repository.js";
import { CacheRefreshRepository } from "../../../../apps/api/src/modules/external/cache-refresh.repository.js";
import * as refreshModule from "../../../../apps/api/src/modules/external/cache-refresh.module.js";
import { withBranch } from "@cashier/db";
import { externalCatalogSync } from "@cashier/db";
import { describe, expect } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = createApp(db, appOptions);

describe("branch catalog refresh", () => {
  it("allows separate branches to acquire independent catalog refresh leases", async () => {
    const auth = await loginAs(app, "admin");
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Refresh workspace" })
      .expect(201);
    const mainStore = new CacheRefreshRepository(db);
    const otherStore = new CacheRefreshRepository(db);
    const now = new Date(),
      expiresAt = new Date(now.getTime() + 60_000);
    try {
      expect(
        await withBranch(testId(1), () =>
          mainStore.tryAcquire("main-test", now, expiresAt),
        ),
      ).toBe(true);
      expect(
        await withBranch(branch.body.id, () =>
          otherStore.tryAcquire("other-test", now, expiresAt),
        ),
      ).toBe(true);
    } finally {
      await withBranch(branch.body.id, () => otherStore.release("other-test"));
      await withBranch(testId(1), () => mainStore.release("main-test"));
    }
  });

  it("runs background refresh in every active workspace and skips archived ones", async () => {
    const auth = await loginAs(app, "admin");
    const active = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Active sync workspace" })
      .expect(201);
    const archived = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Inactive sync workspace" })
      .expect(201);
    await request(app)
      .delete(`/api/branches/${archived.body.id}`)
      .set(auth)
      .expect(200);
    const run = (
      refreshModule as typeof refreshModule & {
        refreshActiveBranches?: (
          db: typeof import("../support/api-setup.js").db,
          refresh: { runDue(): Promise<boolean> },
        ) => Promise<void>;
      }
    ).refreshActiveBranches;
    await run?.(db, {
      runDue: async () => {
        await new CacheRefreshRepository(db).request(
          new Date("2026-09-27T12:00:00Z"),
        );
        return true;
      },
    });
    const rows = await db
      .select({ branchId: externalCatalogSync.branchId })
      .from(externalCatalogSync)
      .orderBy(externalCatalogSync.branchId);
    expect(rows.map((row) => row.branchId)).toEqual([
      testId(1),
      active.body.id,
    ]);
  });

  it("copies the online catalog but keeps ingredient and modifier setup independent", async () => {
    const auth = await loginAs(app, "admin");
    await new ProductsRepository(db).applyCatalog({
      categories: [
        {
          externalId: 3,
          nameAr: "مشروبات",
          nameEn: "Drinks",
          descriptionAr: null,
          descriptionEn: null,
          isActive: true,
          isVisible: true,
          displayOrder: 1,
        },
      ],
      products: [
        {
          externalId: 9,
          externalCategoryId: 3,
          nameAr: "قهوة",
          nameEn: "Coffee",
          descriptionAr: null,
          descriptionEn: null,
          price: "30.00",
          discountPercentage: null,
          discountStart: null,
          discountEnd: null,
          calories: 10,
          pointsReward: 3,
          isAvailable: true,
          isVisible: true,
          imageUrl: null,
          sizes: [],
          modifierGroups: [
            {
              externalId: 92,
              nameAr: "اختيارات",
              nameEn: "Choices",
              isRequired: false,
              maxSelections: 1,
              options: [
                {
                  externalId: 93,
                  nameAr: "بدون سكر",
                  nameEn: "No sugar",
                  extraPrice: "0.00",
                },
              ],
            },
          ],
        },
      ],
    });
    const category = await request(app)
      .post("/api/categories")
      .set(auth)
      .send({ name: "Main ingredient" })
      .expect(201);
    const item = await request(app)
      .post("/api/items")
      .set(auth)
      .send({
        name: "Main coffee",
        categoryId: category.body.id,
        type: "raw",
        stockUnit: "kg",
      })
      .expect(201);
    await request(app)
      .put("/api/products/9/stock-setup")
      .set(auth)
      .send({
        baseIngredients: [{ itemId: item.body.id, quantity: 1 }],
        sizes: [],
        modifiers: [{ externalModifierOptionId: 93, stockEffect: "none" }],
      })
      .expect(200);
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Catalog workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    const fresh = await request(app)
      .get("/api/products")
      .set(other)
      .expect(200);
    expect(fresh.body.products).toHaveLength(1);
    expect(fresh.body.products[0].ingredients).toEqual([]);
    expect(
      fresh.body.products[0].modifierGroups[0].options[0].stockEffect,
    ).toBe("incomplete");
    await request(app)
      .put("/api/products/9/stock-setup")
      .set(other)
      .send({
        baseIngredients: [{ itemId: item.body.id, quantity: 1 }],
        sizes: [],
        modifiers: [{ externalModifierOptionId: 93, stockEffect: "none" }],
      })
      .expect(409);
    const ownCategory = await request(app)
      .post("/api/categories")
      .set(other)
      .send({ name: "Other ingredient" })
      .expect(201);
    const ownItem = await request(app)
      .post("/api/items")
      .set(other)
      .send({
        name: "Other coffee",
        categoryId: ownCategory.body.id,
        type: "raw",
        stockUnit: "kg",
      })
      .expect(201);
    await request(app)
      .put("/api/products/9/stock-setup")
      .set(other)
      .send({
        baseIngredients: [{ itemId: ownItem.body.id, quantity: 2 }],
        sizes: [],
        modifiers: [
          {
            externalModifierOptionId: 93,
            stockEffect: "mapped",
            ingredients: [{ itemId: ownItem.body.id, quantity: 0.25 }],
          },
        ],
      })
      .expect(200);
    const original = await request(app)
      .get("/api/products")
      .set(auth)
      .expect(200);
    expect(original.body.products[0].ingredients[0].quantity).toBe("1.000");
    expect(
      original.body.products[0].modifierGroups[0].options[0].stockEffect,
    ).toBe("none");
    await request(app).post("/api/products/refresh").set(other).expect(202);
    const ownStatus = await request(app)
      .get("/api/products/refresh-status")
      .set(other)
      .expect(200);
    const mainStatus = await request(app)
      .get("/api/products/refresh-status")
      .set(auth)
      .expect(200);
    expect(ownStatus.body.refreshRequestedAt).not.toBeNull();
    expect(mainStatus.body.refreshRequestedAt).toBeNull();
  });
});
