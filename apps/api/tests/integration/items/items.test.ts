import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let authorization: { readonly Authorization: string };
const api = () => ({
  get: (url: string) => request(app()).get(url).set(authorization),
  post: (url: string) => request(app()).post(url).set(authorization),
  put: (url: string) => request(app()).put(url).set(authorization),
  delete: (url: string) => request(app()).delete(url).set(authorization),
});

beforeEach(async () => {
  authorization = await loginAs(app(), "admin");
});

async function createCategory(name = "خامات") {
  const response = await api().post("/api/categories").send({ name });
  expect(response.status).toBe(201);
  return response.body.id as number;
}

async function createItem(categoryId: number, overrides = {}) {
  return api()
    .post("/api/items")
    .send({
      name: "بن برازيلي",
      categoryId,
      type: "raw",
      stockUnit: "كجم",
      purchaseUnit: "شيكارة",
      purchaseToStockFactor: 25,
      mainMinimumLevel: 2,
      cafeMinimumLevel: 1,
      ...overrides,
    });
}

describe("items CRUD", () => {
  it("creates and lists an item with its category", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const list = await api().get("/api/items");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      name: "بن برازيلي",
      categoryId,
      categoryName: "خامات",
      type: "raw",
      stockUnit: "كجم",
      purchaseUnit: "شيكارة",
      purchaseToStockFactor: "25.000000",
      mainMinimumLevel: "2.000",
      cafeMinimumLevel: "1.000",
      isActive: true,
    });
  });

  it("rejects attaching an item to a main category that has children", async () => {
    const mainId = await createCategory();
    const child = await api()
      .post("/api/categories")
      .send({ name: "قهوة", parentId: mainId });
    expect(child.status).toBe(201);

    const response = await createItem(mainId);
    expect(response.status).toBe(409);
  });

  it("updates and deactivates an item", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const updated = await api()
      .put(`/api/items/${created.body.id}`)
      .send({ name: "بن محوج", mainMinimumLevel: 3.5 });
    expect(updated.status).toBe(200);

    const deactivated = await api().delete(`/api/items/${created.body.id}`);
    expect(deactivated.status).toBe(200);

    const list = await api().get("/api/items");
    expect(list.body[0]).toMatchObject({
      name: "بن محوج",
      mainMinimumLevel: "3.500",
      isActive: false,
    });
  });

  it("reactivates an item only while its category is active", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);
    expect((await api().delete(`/api/items/${created.body.id}`)).status).toBe(
      200,
    );

    expect(
      (
        await api()
          .put(`/api/items/${created.body.id}`)
          .send({ isActive: true })
      ).status,
    ).toBe(200);

    expect((await api().delete(`/api/items/${created.body.id}`)).status).toBe(
      200,
    );
    expect((await api().delete(`/api/categories/${categoryId}`)).status).toBe(
      200,
    );
    expect(
      (
        await api()
          .put(`/api/items/${created.body.id}`)
          .send({ isActive: true })
      ).status,
    ).toBe(409);
  });

  it("prevents adding a sub-category beneath a category used by an active item", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const response = await api()
      .post("/api/categories")
      .send({ name: "قهوة", parentId: categoryId });
    expect(response.status).toBe(409);
  });

  it("prevents deactivating a category used by an active item", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const response = await api().delete(`/api/categories/${categoryId}`);
    expect(response.status).toBe(409);
  });

  it("rejects malformed purchase-unit configuration", async () => {
    const categoryId = await createCategory();
    const response = await createItem(categoryId, {
      purchaseToStockFactor: null,
    });
    expect(response.status).toBe(400);
  });

  it("rejects clearing only the purchase unit from an existing pair", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const response = await api()
      .put(`/api/items/${created.body.id}`)
      .send({ purchaseUnit: null });
    expect(response.status).toBe(400);
  });

  it("requires an explicit resale price and never preserves it on non-resale items", async () => {
    const categoryId = await createCategory();
    const rawWithPrice = await createItem(categoryId, { sellingPrice: 20 });
    expect(rawWithPrice.status).toBe(400);

    const raw = await createItem(categoryId);
    expect(raw.status).toBe(201);
    const missingTransitionPrice = await api()
      .put(`/api/items/${raw.body.id}`)
      .send({ type: "resale" });
    expect(missingTransitionPrice.status).toBe(400);

    const pricedTransition = await api()
      .put(`/api/items/${raw.body.id}`)
      .send({ type: "resale", sellingPrice: 25 });
    expect(pricedTransition.status).toBe(200);
    const backToRaw = await api()
      .put(`/api/items/${raw.body.id}`)
      .send({ type: "raw" });
    expect(backToRaw.status).toBe(200);
    const listed = await api().get("/api/items");
    expect(listed.body[0]).toMatchObject({
      type: "raw",
      sellingPrice: null,
    });
  });

  it("rejects cashier access", async () => {
    authorization = await loginAs(app(), "cashier");
    const response = await api().get("/api/items");
    expect(response.status).toBe(403);
  });
});

describe("main warehouse stock view", () => {
  it("returns FIFO quantity, value, and low-stock state", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId, { mainMinimumLevel: 4 });
    expect(created.status).toBe(201);

    const [batchResult] = await db.execute(sql`
      INSERT INTO stock_batches
        (item_id, warehouse, initial_quantity, remaining_quantity, unit_cost, received_at, source_type)
      VALUES
        (${created.body.id}, 'main', 5, 3, 2.5, '2026-07-19 09:00:00', 'purchase')
    `);
    const batchId = batchResult.insertId;
    await db.execute(sql`
      INSERT INTO stock_movements
        (item_id, warehouse, batch_id, movement_type, quantity, unit_cost, occurred_at)
      VALUES
        (${created.body.id}, 'main', ${batchId}, 'purchase', 5, 2.5, '2026-07-19 09:00:00'),
        (${created.body.id}, 'main', ${batchId}, 'transfer_out', -2, 2.5, '2026-07-19 10:00:00')
    `);

    const response = await api().get("/api/inventory/main/stock");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      itemId: created.body.id,
      quantity: "3.000",
      stockValue: "7.500000000",
      minimumLevel: "4.000",
      isLowStock: true,
    });
  });

  it("treats a zero threshold as disabled while still flagging negative stock", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId, { mainMinimumLevel: 0 });
    expect(created.status).toBe(201);

    const response = await api().get("/api/inventory/main/stock");
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      quantity: "0.000",
      minimumLevel: "0.000",
      isLowStock: false,
      isNegativeStock: false,
    });

    await db.execute(sql`
      INSERT INTO stock_movements
        (item_id, warehouse, movement_type, quantity, unit_cost, occurred_at)
      VALUES
        (${created.body.id}, 'main', 'adjustment_shortage', -1, 0, '2026-07-19 11:00:00')
    `);
    const negative = await api().get("/api/inventory/main/stock");
    expect(negative.body[0]).toMatchObject({
      quantity: "-1.000",
      isLowStock: false,
      isNegativeStock: true,
    });
  });

  it("exposes whether an item has stock history", async () => {
    const categoryId = await createCategory();
    const created = await createItem(categoryId);
    expect(created.status).toBe(201);

    const beforeMovement = await api().get("/api/items");
    expect(beforeMovement.body[0].hasStockHistory).toBe(false);

    await db.execute(sql`
      INSERT INTO stock_movements
        (item_id, warehouse, movement_type, quantity, unit_cost, occurred_at)
      VALUES
        (${created.body.id}, 'main', 'adjustment', 1, 0, '2026-07-19 11:00:00')
    `);

    const afterMovement = await api().get("/api/items");
    expect(afterMovement.body[0].hasStockHistory).toBe(true);
  });
});
