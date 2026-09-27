import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import {
  categories,
  externalCategories,
  externalProductIngredients,
  externalProducts,
  items,
  shiftEvents,
  shifts,
  stockBatches,
  stockMovements,
  users,
} from "../../src/db/schema.js";
import { appOptions, db, nextTestItemCode } from "../setup.js";
import { loginAs } from "../helpers.js";

const app = createApp(db, appOptions);
describe("reports", () => {
  it("returns every supported report section for an admin", async () => {
    const auth = await loginAs(app, "admin");
    const response = await request(app)
      .get("/api/reports?from=2026-09-01&to=2026-09-30")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      range: { from: "2026-09-01", to: "2026-09-30" },
      sales: {
        byDay: [],
        byProduct: [],
        byCategory: [],
        byShift: [],
        byCashier: [],
      },
      stock: { current: [], lowStock: [], ledger: [] },
      money: { cashFlow: [], expenseBreakdown: [], shiftOverShort: [] },
      wasteAndRefunds: {
        waste: [],
        wasteSummary: [],
        refunds: [],
        refundSummary: [],
      },
      suppliers: { summary: [], purchases: [], payments: [] },
    });
  });

  it("rejects cashier access", async () => {
    const auth = await loginAs(app, "cashier");
    const response = await request(app).get("/api/reports/dashboard").set(auth);
    expect(response.status).toBe(403);
  });

  it("includes negative stock without a minimum in dashboard and report alerts", async () => {
    const auth = await loginAs(app, "admin");
    const [category] = await db
      .insert(categories)
      .values({ name: "Stock alerts" });
    for (const fixture of [
      {
        name: "negative",
        quantity: "-1.000",
        minimum: "0.000",
        isActive: true,
      },
      {
        name: "inactive",
        quantity: "-1.000",
        minimum: "0.000",
        isActive: false,
      },
      { name: "empty", quantity: "0.000", minimum: "0.000", isActive: true },
      { name: "positive", quantity: "1.000", minimum: "0.000", isActive: true },
      {
        name: "threshold",
        quantity: "5.000",
        minimum: "5.000",
        isActive: true,
      },
    ]) {
      const [item] = await db.insert(items).values({
        code: nextTestItemCode(),
        name: fixture.name,
        categoryId: category.insertId,
        type: "raw",
        stockUnit: "kg",
        cafeMinimumLevel: fixture.minimum,
        isActive: fixture.isActive,
      });
      if (fixture.quantity !== "0.000") {
        await db.insert(stockMovements).values({
          itemId: item.insertId,
          warehouse: "cafe",
          movementType: "adjustment",
          quantity: fixture.quantity,
          unitCost: "0.000000",
          occurredAt: new Date("2026-09-01T10:00:00Z"),
        });
      }
    }

    const dashboard = await request(app)
      .get("/api/reports/dashboard")
      .set(auth);
    const report = await request(app)
      .get("/api/reports?from=2026-09-01&to=2026-09-30")
      .set(auth);
    expect(dashboard.status).toBe(200);
    expect(report.status).toBe(200);
    for (const alerts of [dashboard.body.stock, report.body.stock.lowStock]) {
      expect(alerts.map((row: { name: string }) => row.name)).toEqual([
        "negative",
        "threshold",
      ]);
      expect(
        alerts.every((row: { warehouse: string }) => row.warehouse === "cafe"),
      ).toBe(true);
    }
  });

  async function createExternalCategoryFixture() {
    const now = new Date();
    const [itemCategory] = await db
      .insert(categories)
      .values({ name: "مخزون" });
    const [ingredient] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: itemCategory.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    await db.insert(externalCategories).values({
      externalId: 3,
      nameAr: "مشروبات",
      nameEn: "Drinks",
      descriptionAr: null,
      descriptionEn: null,
      isActive: true,
      isVisible: true,
      displayOrder: 1,
      isCurrent: true,
      syncedAt: now,
    });
    await db.insert(externalProducts).values({
      externalId: 9,
      externalCategoryId: 3,
      nameAr: "لاتيه",
      nameEn: "Latte",
      descriptionAr: null,
      descriptionEn: null,
      imageUrl: null,
      price: "80.00",
      discountPercentage: null,
      discountStart: null,
      discountEnd: null,
      calories: 120,
      pointsReward: 8,
      isAvailable: true,
      isVisible: true,
      isCurrent: true,
      syncedAt: now,
    });
    await db.insert(externalProductIngredients).values({
      externalProductId: 9,
      itemId: ingredient.insertId,
      quantity: "0.020",
    });
    const [batch] = await db.insert(stockBatches).values({
      itemId: ingredient.insertId,
      warehouse: "cafe",
      initialQuantity: "1.000",
      remainingQuantity: "1.000",
      unitCost: "10.000000",
      receivedAt: new Date("2026-08-18T08:00:00.000Z"),
      sourceType: "transfer_in",
    });
    await db.insert(stockMovements).values({
      itemId: ingredient.insertId,
      warehouse: "cafe",
      batchId: batch.insertId,
      movementType: "transfer_in",
      quantity: "1.000",
      unitCost: "10.000000",
      occurredAt: new Date("2026-08-18T08:00:00.000Z"),
    });
  }

  async function sellLatte(cashierAuthorization: {
    readonly Authorization: string;
  }) {
    const sale = await request(app)
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [
          {
            type: "external_product",
            externalProductId: 9,
            externalSizeId: null,
            quantity: 2,
            modifiers: [],
          },
        ],
        discount: null,
        cashReceived: 300,
      });
    expect(sale.status).toBe(201);
    return sale.body as { id: number; lines: { id: number }[] };
  }

  it("counts an external-product sale under its external category", async () => {
    const adminAuthorization = await loginAs(app, "admin");
    const cashierAuthorization = await loginAs(app, "cashier");
    await request(app)
      .post("/api/shifts/open")
      .set(cashierAuthorization)
      .send({ openingFloat: 0 });
    await createExternalCategoryFixture();
    await sellLatte(cashierAuthorization);

    const report = await request(app)
      .get("/api/reports?from=2026-01-01&to=2026-12-31")
      .set(adminAuthorization);

    expect(report.status).toBe(200);
    const rows = report.body.sales.byCategory;
    expect(rows).toHaveLength(1);
    expect(rows[0].mainCategory).toBe("مشروبات");
    expect(rows[0].category).toBe("مشروبات");
    expect(Number(rows[0].sales)).toBeCloseTo(160, 6);
    expect(Number(rows[0].refunds)).toBe(0);
    expect(Number(rows[0].cost)).toBeCloseTo(0.4, 6);
    expect(Number(rows[0].returnedCost)).toBe(0);
    expect(Number(rows[0].profit)).toBeCloseTo(159.6, 6);
  });

  it("counts an external-product refund under the same external category", async () => {
    const adminAuthorization = await loginAs(app, "admin");
    const cashierAuthorization = await loginAs(app, "cashier");
    await request(app)
      .post("/api/shifts/open")
      .set(cashierAuthorization)
      .send({ openingFloat: 0 });
    await createExternalCategoryFixture();
    const sale = await sellLatte(cashierAuthorization);

    const refund = await request(app)
      .post("/api/refunds")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        orderId: sale.id,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: sale.lines[0].id,
            quantity: 1,
            stockAction: "not_returnable",
          },
        ],
      });
    expect(refund.status).toBe(201);

    const report = await request(app)
      .get("/api/reports?from=2026-01-01&to=2026-12-31")
      .set(adminAuthorization);

    expect(report.status).toBe(200);
    const rows = report.body.sales.byCategory;
    expect(rows).toHaveLength(1);
    expect(rows[0].mainCategory).toBe("مشروبات");
    expect(rows[0].category).toBe("مشروبات");
    expect(Number(rows[0].sales)).toBeCloseTo(160, 6);
    expect(Number(rows[0].refunds)).toBeCloseTo(80, 6);
    expect(Number(rows[0].returnedCost)).toBe(0);
    expect(Number(rows[0].profit)).toBeCloseTo(79.6, 6);
  });

  it.each([
    {
      scenario: "an overnight closed gap",
      firstClose: "2026-09-10T10:00:00Z",
      reopen: "2026-09-11T08:00:00Z",
      lastClose: "2026-09-11T09:00:00Z",
      expectedMinutes: 180,
    },
    {
      scenario: "a close in the same second as opening",
      firstClose: "2026-09-10T08:00:00Z",
      reopen: "2026-09-11T08:00:00Z",
      lastClose: "2026-09-11T09:00:00Z",
      expectedMinutes: 60,
    },
    {
      scenario: "two forty-second work segments",
      firstClose: "2026-09-10T08:00:40Z",
      reopen: "2026-09-10T08:01:00Z",
      lastClose: "2026-09-10T08:01:40Z",
      expectedMinutes: 1,
    },
  ])(
    "counts only worked time with $scenario",
    async ({ firstClose, reopen, lastClose, expectedMinutes }) => {
      const adminAuthorization = await loginAs(app, "admin");
      await loginAs(app, "cashier");
      const [[cashier], [admin]] = await Promise.all([
        db
          .select({ id: users.id, employeeId: users.employeeId })
          .from(users)
          .where(eq(users.username, "cashier")),
        db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, "admin")),
      ]);

      // Closed gaps do not count, and sub-minute segments round only after summing.
      const [shift] = await db.insert(shifts).values({
        cashierUserId: cashier.id,
        employeeId: cashier.employeeId!,
        status: "closed",
        openingFloat: "0.00",
        openedAt: new Date("2026-09-10T08:00:00.000Z"),
        closedAt: new Date(lastClose),
      });
      await db.insert(shiftEvents).values([
        {
          shiftId: shift.insertId,
          action: "open",
          actorUserId: cashier.id,
          occurredAt: new Date("2026-09-10T08:00:00.000Z"),
        },
        {
          shiftId: shift.insertId,
          action: "close",
          actorUserId: cashier.id,
          occurredAt: new Date(firstClose),
        },
        {
          shiftId: shift.insertId,
          action: "reopen",
          actorUserId: admin.id,
          occurredAt: new Date(reopen),
        },
        {
          shiftId: shift.insertId,
          action: "close",
          actorUserId: admin.id,
          occurredAt: new Date(lastClose),
        },
      ]);

      const report = await request(app)
        .get("/api/reports?from=2026-09-01&to=2026-09-30")
        .set(adminAuthorization);

      expect(report.status).toBe(200);
      const row = report.body.employees.activity.find(
        (entry: { id: number }) => entry.id === cashier.employeeId,
      );
      expect(Number(row.workedMinutes)).toBe(expectedMinutes);
      expect(Number(row.shiftsCount)).toBe(1);

      // the report must agree with the shift screen, which already walked the
      // same events
      const shiftList = await request(app)
        .get("/api/shifts")
        .set(adminAuthorization);
      expect(shiftList.status).toBe(200);
      const detail = shiftList.body.find(
        (entry: { id: number }) => entry.id === shift.insertId,
      );
      expect(detail.workedMinutes).toBe(expectedMinutes);
    },
  );
});
