import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  externalCategories,
  externalProductIngredients,
  externalProducts,
  items,
  expenseCategories,
  expenses,
  preparations,
  preparationAllocations,
  recipes,
  transfers,
  transferLines,
  transferRequests,
  transferRequestLines,
  suppliers,
  supplierPayments,
  purchaseInvoices,
  purchaseLines,
  orders,
  refunds,
  shiftEvents,
  shifts,
  stockBatches,
  stockMovements,
  users,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import { ReportsRepository } from "../../../../apps/api/src/modules/reports/reports.repository.js";

const app = createApp(db, appOptions);
describe("reports", () => {
  it("keeps report sections consistent when a transaction changes during generation", async () => {
    await loginAs(app, "cashier");
    const [cashier] = await db
      .select()
      .from(users)
      .where(eq(users.username, "cashier"));
    const [sale] = await db.insert(orders).values({
      orderNumber: "snapshot",
      clientRequestId: randomUUID(),
      requestFingerprint: "fixture",
      cashierId: cashier.id,
      subtotal: "100.00",
      total: "100.00",
      cashReceived: "100.00",
      changeAmount: "0.00",
      createdAt: new Date("2026-09-11T08:00:00Z"),
    });
    const repo = new ReportsRepository(db);
    await repo.snapshot(async (snapshot) => {
      const before = await snapshot.salesByDay(
        new Date("2026-09-11T00:00:00Z"),
        new Date("2026-09-12T00:00:00Z"),
      );
      await db
        .update(orders)
        .set({ total: "200.00" })
        .where(eq(orders.id, sale.insertId));
      const after = await snapshot.salesByCashier(
        new Date("2026-09-11T00:00:00Z"),
        new Date("2026-09-12T00:00:00Z"),
      );
      expect(Number(before[0].sales)).toBe(100);
      expect(Number(after[0].sales)).toBe(100);
    });
    const current = await repo.salesByDay(
      new Date("2026-09-11T00:00:00Z"),
      new Date("2026-09-12T00:00:00Z"),
    );
    expect(Number(current[0].sales)).toBe(200);
  });
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
        byCashier: [expect.objectContaining({ cashierName: "مدير (إدارة)" })],
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

  it("lists admin sales in the by-cashier report marked as إدارة", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    await db.insert(orders).values({
      orderNumber: "admin-sale",
      clientRequestId: randomUUID(),
      requestFingerprint: "fixture",
      cashierId: admin.id,
      shiftId: null,
      subtotal: "50.00",
      total: "50.00",
      cashReceived: "50.00",
      changeAmount: "0.00",
      totalCost: "10.00",
      isAdminSale: true,
      createdAt: new Date("2026-09-11T08:00:00Z"),
    });

    const response = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth);

    expect(response.status).toBe(200);
    const row = response.body.sales.byCashier.find((entry: {
      cashierName: string;
    }) => entry.cashierName.includes("إدارة"));
    expect(row).toBeDefined();
    expect(Number(row.sales)).toBe(50);
    expect(Number(row.ordersCount)).toBe(1);
  });

  it("separates current supplier balances from dated purchases and payments", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    const [supplier] = await db
      .insert(suppliers)
      .values({ name: "Supplier", openingBalance: "10.00" });
    const [category] = await db.insert(categories).values({ name: "Supplies" });
    const [item] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "Milk",
      type: "raw",
      categoryId: category.insertId,
      stockUnit: "litre",
    });
    for (const purchasedAt of ["2026-09-11", "2026-09-12"]) {
      const [invoice] = await db.insert(purchaseInvoices).values({
        supplierId: supplier.insertId,
        invoiceNumber: purchasedAt,
        purchasedAt,
        createdBy: admin.id,
        totalAmount: "20.00",
        paidAmount: "5.00",
        clientRequestId: randomUUID(),
        requestFingerprint: "fixture",
      });
      await db.insert(purchaseLines).values({
        invoiceId: invoice.insertId,
        itemId: item.insertId,
        quantity: "2.000",
        stockQuantity: "2.000",
        unitMode: "stock",
        unitPrice: "10.00",
        unitCost: "10.000000",
        lineTotal: "20.00",
      });
      await db.insert(supplierPayments).values({
        supplierId: supplier.insertId,
        purchaseInvoiceId: invoice.insertId,
        amount: "5.00",
        paidAt: purchasedAt,
      });
    }
    const report = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .expect(200);
    expect(Number(report.body.suppliers.summary[0].balance)).toBe(40);
    expect(report.body.suppliers.purchases).toHaveLength(1);
    expect(report.body.suppliers.payments).toHaveLength(1);
    expect(report.body.suppliers.purchaseLines).toHaveLength(1);
    expect(report.body.suppliers.purchaseLines[0].stockUnit).toBe("litre");
    expect(Number(report.body.suppliers.purchaseLines[0].stockQuantity)).toBe(
      2,
    );
    expect(Number(report.body.suppliers.payments[0].purchaseInvoiceId)).toBe(
      report.body.suppliers.purchases[0].id,
    );
    expect(report.body.range.generatedAt).toMatch(/Z$/);
    expect(report.body.money.cashFlow[0].occurredAt).toBe("2026-09-11");
  });

  it("clips shift sales to the Cairo period across overnight and reopened shifts", async () => {
    const admin = await loginAs(app, "admin");
    await loginAs(app, "cashier");
    const [cashier] = await db
      .select()
      .from(users)
      .where(eq(users.username, "cashier"));
    const [shift] = await db.insert(shifts).values({
      cashierUserId: cashier.id,
      employeeId: cashier.employeeId!,
      status: "closed",
      openingFloat: "10.00",
      openedAt: new Date("2026-09-10T18:00:00Z"),
      closedAt: new Date("2026-09-12T10:00:00Z"),
      overShort: "3.00",
    });
    for (const [action, occurredAt] of [
      ["open", "2026-09-10T18:00:00Z"],
      ["close", "2026-09-10T23:00:00Z"],
      ["reopen", "2026-09-11T18:00:00Z"],
      ["close", "2026-09-12T10:00:00Z"],
    ] as const)
      await db.insert(shiftEvents).values({
        shiftId: shift.insertId,
        action,
        actorUserId: cashier.id,
        occurredAt: new Date(occurredAt),
        overShort: action === "close" ? "3.00" : null,
      });
    const saleIds: number[] = [];
    for (const [total, cost, discount, createdAt] of [
      [100, 20, 10, "2026-09-10T20:59:59Z"],
      [80, 16, 5, "2026-09-10T21:00:00Z"],
      [60, 12, 2, "2026-09-11T20:59:59Z"],
      [200, 40, 20, "2026-09-11T21:00:00Z"],
    ] as const) {
      const id = randomUUID();
      const [sale] = await db.insert(orders).values({
        orderNumber: id,
        clientRequestId: id,
        requestFingerprint: "fixture",
        cashierId: cashier.id,
        shiftId: shift.insertId,
        subtotal: String(total + discount),
        total: String(total),
        totalCost: String(cost),
        discountAmount: String(discount),
        cashReceived: String(total),
        changeAmount: "0.00",
        createdAt: new Date(createdAt),
      });
      saleIds.push(sale.insertId);
    }
    for (const [amount, returnedCost, createdAt] of [
      [15, 3, "2026-09-11T12:00:00Z"],
      [20, 4, "2026-09-12T12:00:00Z"],
    ] as const)
      await db.insert(refunds).values({
        clientRequestId: randomUUID(),
        requestFingerprint: "fixture",
        orderId: saleIds[0]!,
        cashierId: cashier.id,
        shiftId: shift.insertId,
        reason: "fixture",
        amount: String(amount),
        totalCostReturned: String(returnedCost),
        createdAt: new Date(createdAt),
      });
    const report = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(admin)
      .expect(200);
    expect(report.body.sales.byShift).toHaveLength(1);
    const row = report.body.sales.byShift[0];
    expect(Number(row.sales)).toBe(140);
    expect(Number(row.discounts)).toBe(7);
    expect(Number(row.refunds)).toBe(15);
    expect(Number(row.cost)).toBe(28);
    expect(Number(row.profit)).toBe(100);
    expect(Number(row.lifetimeSales)).toBe(440);
    expect(Number(row.lifetimeRefunds)).toBe(35);
    expect(report.body.sales.byDay).toHaveLength(1);
    expect(report.body.sales.byDay[0].day).toBe("2026-09-11");
    expect(Number(report.body.sales.byDay[0].sales)).toBe(140);
    expect(report.body.money.shiftOverShort).toHaveLength(1);
    expect(report.body.money.shiftOverShort[0].action).toBe("close");
    expect(Number(report.body.money.shiftOverShort[0].overShort)).toBe(3);
  });

  it("reports branch-scoped transfers, preparations and expenses with detail and responsible staff", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    const other = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Other" })
      .expect(201);
    for (const branchId of [1, other.body.id as number]) {
      const [category] = await db
        .insert(categories)
        .values({ branchId, name: "Materials" });
      const [item] = await db.insert(items).values({
        branchId,
        code: nextTestItemCode(),
        name: "Flour",
        categoryId: category.insertId,
        type: "raw",
        stockUnit: "kg",
      });
      const [batch] = await db.insert(stockBatches).values({
        branchId,
        itemId: item.insertId,
        warehouse: "main",
        initialQuantity: "10.000",
        remainingQuantity: "5.000",
        unitCost: "4.000000",
        receivedAt: new Date("2026-09-01T08:00:00Z"),
        sourceType: "purchase",
      });
      const [recipe] = await db.insert(recipes).values({
        branchId,
        name: "Dough",
        type: "prepared",
        categoryId: category.insertId,
        outputItemId: item.insertId,
      });
      const [expenseCategory] = await db
        .insert(expenseCategories)
        .values({ branchId, name: "Transport" });
      for (const occurredAt of [
        new Date("2026-09-11T08:00:00Z"),
        new Date("2026-09-12T08:00:00Z"),
      ]) {
        const [tr] = await db.insert(transferRequests).values({
          branchId,
          requestedBy: admin.id,
          reviewedBy: admin.id,
          status: "approved",
          clientRequestId: randomUUID(),
          requestFingerprint: "fixture",
          createdAt: occurredAt,
          reviewedAt: occurredAt,
        });
        await db.insert(transferRequestLines).values({
          branchId,
          requestId: tr.insertId,
          itemId: item.insertId,
          quantity: "3.000",
        });
        const [transfer] = await db.insert(transfers).values({
          branchId,
          requestId: tr.insertId,
          createdBy: admin.id,
          approvedBy: admin.id,
          createdAt: occurredAt,
        });
        for (const [quantity, unitCost] of [
          ["1.000", "4.000000"],
          ["2.000", "5.000000"],
        ]) {
          const [cafeBatch] = await db.insert(stockBatches).values({
            branchId,
            itemId: item.insertId,
            warehouse: "cafe",
            initialQuantity: quantity,
            remainingQuantity: quantity,
            unitCost,
            receivedAt: occurredAt,
            sourceType: "transfer_in",
          });
          await db.insert(transferLines).values({
            branchId,
            transferId: transfer.insertId,
            itemId: item.insertId,
            quantity,
            unitCost,
            sourceBatchId: batch.insertId,
            cafeBatchId: cafeBatch.insertId,
          });
        }
        const [prep] = await db.insert(preparations).values({
          branchId,
          recipeId: recipe.insertId,
          recipeName: "Dough",
          outputItemId: item.insertId,
          outputItemName: "Prepared dough",
          producedQuantity: "2.000",
          totalCost: "8.00",
          unitCost: "4.000000",
          preparedBy: admin.id,
          occurredAt,
        });
        await db.insert(preparationAllocations).values({
          branchId,
          preparationId: prep.insertId,
          ingredientItemId: item.insertId,
          ingredientItemName: "Flour",
          quantity: "2.000",
          unitCost: "4.000000",
          sourceBatchId: batch.insertId,
        });
        await db.insert(expenses).values({
          branchId,
          clientRequestId: randomUUID(),
          requestFingerprint: "fixture",
          type: "general",
          categoryId: expenseCategory.insertId,
          amount: "7.00",
          expenseDate: occurredAt.toISOString().slice(0, 10),
          recordedBy: admin.id,
        });
      }
    }
    const report = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .expect(200);
    expect(report.body.operations?.transfers).toHaveLength(1);
    expect(Number(report.body.operations.transfers[0].totalCost)).toBe(14);
    expect(Number(report.body.operations.transfers[0].itemCount)).toBe(1);
    expect(report.body.operations.transferLines).toHaveLength(1);
    expect(Number(report.body.operations.transferLines[0].quantity)).toBe(3);
    expect(report.body.operations.requests).toHaveLength(1);
    expect(report.body.operations.requests[0].status).toBe("approved");
    expect(report.body.operations.requestLines).toHaveLength(1);
    expect(report.body.operations.preparations).toHaveLength(1);
    expect(report.body.operations.preparations[0].preparedByName).toBe("مدير");
    expect(Number(report.body.operations.preparations[0].totalCost)).toBe(8);
    expect(report.body.operations.ingredients).toHaveLength(1);
    expect(report.body.money.expenses).toHaveLength(1);
    expect(report.body.money.expenses[0].recordedByName).toBe("مدير");
    expect(Number(report.body.money.expenses[0].amount)).toBe(7);
    const otherReport = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .set("X-Branch-Id", String(other.body.id))
      .expect(200);
    expect(otherReport.body.operations.transfers).toHaveLength(1);
    expect(otherReport.body.operations.transfers[0].id).not.toBe(
      report.body.operations.transfers[0].id,
    );
    expect(otherReport.body.operations.ingredients[0].preparationId).not.toBe(
      report.body.operations.ingredients[0].preparationId,
    );
  });

  it("reports a refund-only shift opened before the selected period", async () => {
    const admin = await loginAs(app, "admin");
    const cashier = await loginAs(app, "cashier");
    const opened = await request(app)
      .post("/api/shifts/open")
      .set(cashier)
      .send({ openingFloat: 0 })
      .expect(201);
    await createExternalCategoryFixture();
    const sale = await sellLatte(cashier);
    const refund = await request(app)
      .post("/api/refunds")
      .set(cashier)
      .send({
        clientRequestId: randomUUID(),
        orderId: sale.id,
        reason: "returned",
        lines: [
          {
            orderLineId: sale.lines[0].id,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      })
      .expect(201);
    await db
      .update(shifts)
      .set({ openedAt: new Date("2026-09-01T08:00:00Z") })
      .where(eq(shifts.id, opened.body.id));
    await db
      .update(shiftEvents)
      .set({ occurredAt: new Date("2026-09-01T08:00:00Z") })
      .where(eq(shiftEvents.shiftId, opened.body.id));
    await db
      .update(orders)
      .set({ createdAt: new Date("2026-09-01T09:00:00Z") })
      .where(eq(orders.id, sale.id));
    await db
      .update(refunds)
      .set({ createdAt: new Date("2026-09-11T09:00:00Z") })
      .where(eq(refunds.id, refund.body.id));
    const report = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(admin)
      .expect(200);
    const row = report.body.sales.byShift[0];
    expect(row?.shiftId).toBe(opened.body.id);
    expect(Number(row.sales)).toBe(0);
    expect(Number(row.refunds)).toBe(80);
    expect(Number(row.profit)).toBeCloseTo(-79.8, 6);
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
      if (expectedMinutes === 180) {
        const gap = await request(app)
          .get("/api/reports?from=2026-09-10&to=2026-09-10")
          .set(adminAuthorization)
          .expect(200);
        expect(Number(gap.body.employees.activity[0].workedMinutes)).toBe(120);
        const clipped = await request(app)
          .get("/api/reports?from=2026-09-11&to=2026-09-11")
          .set(adminAuthorization)
          .expect(200);
        expect(Number(clipped.body.employees.activity[0].workedMinutes)).toBe(
          60,
        );
        await db
          .update(shifts)
          .set({ closedAt: new Date("2026-09-12T09:00:00Z") })
          .where(eq(shifts.id, shift.insertId));
        await db
          .update(shiftEvents)
          .set({ occurredAt: new Date("2026-09-12T08:00:00Z") })
          .where(eq(shiftEvents.action, "reopen"));
        await db
          .update(shiftEvents)
          .set({ occurredAt: new Date("2026-09-12T09:00:00Z") })
          .where(eq(shiftEvents.occurredAt, new Date(lastClose)));
        const closedGap = await request(app)
          .get("/api/reports?from=2026-09-11&to=2026-09-11")
          .set(adminAuthorization)
          .expect(200);
        expect(Number(closedGap.body.employees.activity[0].workedMinutes)).toBe(
          0,
        );
        expect(Number(closedGap.body.employees.activity[0].shiftsCount)).toBe(
          0,
        );
        expect(closedGap.body.sales.byShift).toEqual([]);
      }
    },
  );
});
