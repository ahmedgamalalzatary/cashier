import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { ProductsRepository } from "../../../src/modules/products/products.repository.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const catalog = {
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
  products: [1, 2].map((externalId) => ({
    externalId,
    externalCategoryId: 3,
    nameAr: externalId === 1 ? "قهوة" : "شاي",
    nameEn: externalId === 1 ? "Coffee" : "Tea",
    descriptionAr: null,
    descriptionEn: null,
    imageUrl: null,
    price: "10.00",
    discountPercentage: null,
    discountStart: null,
    discountEnd: null,
    calories: 0,
    pointsReward: 0,
    isAvailable: true,
    isVisible: true,
    sizes: [],
    modifierGroups: [],
  })),
};

describe("cached product API", () => {
  it("searches and paginates locally while hard refresh only queues work", async () => {
    await new ProductsRepository(db).applyCatalog(catalog);
    const app = createApp(db, appOptions);
    const admin = await loginAs(app, "admin");

    const list = await request(app)
      .get("/api/products?search=coffee&page=1&pageSize=1")
      .set(admin);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      products: [{ externalId: 1 }],
      pagination: { totalCount: 1, currentPage: 1 },
    });

    const refresh = await request(app).post("/api/products/refresh").set(admin);
    expect(refresh.status).toBe(202);
    const status = await request(app)
      .get("/api/products/refresh-status")
      .set(admin);
    expect(status.body.refreshRequestedAt).toBeTruthy();
  });

  it("normalizes fractional pagination and returns one consistent empty page", async () => {
    await new ProductsRepository(db).applyCatalog(catalog);
    const app = createApp(db, appOptions);
    const admin = await loginAs(app, "admin");
    const response = await request(app)
      .get("/api/products?search=missing&page=2.9&pageSize=1.8")
      .set(admin);

    expect(response.status).toBe(200);
    expect(response.body.products).toEqual([]);
    expect(response.body.pagination).toEqual({
      currentPage: 1,
      pageSize: 1,
      totalCount: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it("returns the complete catalog in one explicit unpaginated response", async () => {
    await new ProductsRepository(db).applyCatalog(catalog);
    const app = createApp(db, appOptions);
    const admin = await loginAs(app, "admin");
    const response = await request(app)
      .get("/api/products?all=true")
      .set(admin);

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(2);
    expect(response.body.pagination).toMatchObject({
      currentPage: 1,
      pageSize: 2,
      totalCount: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});
