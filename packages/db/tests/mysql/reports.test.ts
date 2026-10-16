import { it, testBranchValues } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
  categories,
  employees,
  items,
  expenseCategories,
  expenses,
  orders,
  refunds,
  salaryAdvances,
  salaryPayments,
  users,
  wasteEntries,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import { app } from "../support/reports-fixtures.js";
import { ReportsRepository } from "../../../../packages/server-core/src/modules/reports/reports.repository.js";

describe("reports", () => {
  it("keeps report sections consistent when a transaction changes during generation", async () => {
    await loginAs(app, "cashier");
    const [cashier] = await db
      .select()
      .from(users)
      .where(eq(users.username, "cashier"));
    const [sale] = await db
      .insert(orders)
      .values(
        testBranchValues({
          orderNumber: "snapshot",
          clientRequestId: randomUUID(),
          requestFingerprint: "fixture",
          cashierId: cashier.id,
          subtotal: "100.00",
          total: "100.00",
          cashReceived: "100.00",
          changeAmount: "0.00",
          createdAt: new Date("2026-09-11T08:00:00Z"),
        }),
      )
      .$returningId();
    const repo = new ReportsRepository(db);
    await repo.snapshot(async (snapshot) => {
      const before = await snapshot.salesByDay(
        new Date("2026-09-11T00:00:00Z"),
        new Date("2026-09-12T00:00:00Z"),
      );
      await db
        .update(orders)
        .set({ total: "200.00" })
        .where(eq(orders.id, sale.id));
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
    await db.insert(orders).values(
      testBranchValues({
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
      }),
    );

    const response = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth);

    expect(response.status).toBe(200);
    const row = response.body.sales.byCashier.find(
      (entry: { cashierName: string }) => entry.cashierName.includes("إدارة"),
    );
    expect(row).toBeDefined();
    expect(Number(row.sales)).toBe(50);
    expect(Number(row.ordersCount)).toBe(1);
  });

  it("sums the overview of a period and of the same-length period before it", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    const sale = async (orderNumber: string, total: string, cost: string, at: string) => {
      const [order] = await db
        .insert(orders)
        .values(
          testBranchValues({
            orderNumber,
            clientRequestId: randomUUID(),
            requestFingerprint: "fixture",
            cashierId: admin.id,
            subtotal: total,
            total,
            cashReceived: total,
            changeAmount: "0.00",
            totalCost: cost,
            isAdminSale: true,
            createdAt: new Date(at),
          }),
        )
        .$returningId();
      return order.id;
    };
    // 2026-09-20 (Cairo) is the range; 2026-09-19 is the period before it.
    const first = await sale("overview-1", "300.00", "100.00", "2026-09-20T08:00:00Z");
    await sale("overview-2", "100.00", "40.00", "2026-09-20T20:00:00Z");
    await sale("overview-before", "50.00", "20.00", "2026-09-19T10:00:00Z");
    // the last instant before Cairo midnight belongs to the 19th, not the 20th
    await sale("overview-edge", "7.00", "0.00", "2026-09-19T20:59:59Z");
    await db.insert(refunds).values(
      testBranchValues({
        clientRequestId: randomUUID(),
        requestFingerprint: "fixture",
        orderId: first,
        cashierId: admin.id,
        reason: "fixture",
        amount: "60.00",
        totalCostReturned: "20.00",
        createdAt: new Date("2026-09-20T09:00:00Z"),
      }),
    );
    const [category] = await db
      .insert(expenseCategories)
      .values(testBranchValues({ name: "كهرباء" }))
      .$returningId();
    await db.insert(expenses).values(
      testBranchValues({
        clientRequestId: randomUUID(),
        requestFingerprint: "fixture",
        type: "general",
        categoryId: category.id,
        amount: "45.00",
        expenseDate: "2026-09-20",
        recordedBy: admin.id,
      }),
    );
    const [itemCategory] = await db
      .insert(categories)
      .values(testBranchValues({ name: "مخزون التقرير" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "لبن",
          type: "raw",
          categoryId: itemCategory.id,
          stockUnit: "لتر",
        }),
      )
      .$returningId();
    await db.insert(wasteEntries).values(
      testBranchValues({
        clientRequestId: randomUUID(),
        targetType: "item",
        itemId: item.id,
        reasonCode: "damaged",
        warehouse: "cafe",
        quantity: "1.000",
        reason: "fixture",
        totalCost: "12.50",
        recordedBy: admin.id,
        occurredAt: new Date("2026-09-20T10:00:00Z"),
      }),
    );
    const [employee] = await db
      .insert(employees)
      .values(testBranchValues({ name: "موظف التقرير" }))
      .$returningId();
    await db.insert(salaryAdvances).values(
      testBranchValues({
        employeeId: employee.id,
        amount: "30.00",
        entryDate: "2026-09-20",
        recordedBy: admin.id,
      }),
    );
    await db.insert(salaryPayments).values(
      testBranchValues({
        employeeId: employee.id,
        periodMonth: "2026-08-01",
        basePay: "100.00",
        bonuses: "0.00",
        deductions: "0.00",
        advances: "0.00",
        netPay: "100.00",
        paidBy: admin.id,
        paidAt: new Date("2026-09-20T11:00:00Z"),
      }),
    );

    const { body } = await request(app)
      .get("/api/reports?from=2026-09-20&to=2026-09-20")
      .set(auth)
      .expect(200);

    expect(body.overview.current).toEqual({
      sales: 400,
      refunds: 60,
      netSales: 340,
      ordersCount: 2,
      averageOrder: 200,
      cost: 140,
      returnedCost: 20,
      grossProfit: 220,
      margin: 64.7,
      expenses: 45,
      wasteCost: 12.5,
      salaries: 130,
      netProfit: 32.5,
    });
    expect(body.overview.previous).toMatchObject({
      from: "2026-09-19",
      to: "2026-09-19",
      sales: 57,
      ordersCount: 2,
      grossProfit: 37,
      netProfit: 37,
    });
    // 08:00 UTC is 11:00 in Cairo summer time
    expect(body.overview.byHour[11]).toEqual({ hour: 11, sales: 300, ordersCount: 1 });

    const empty = await request(app)
      .get("/api/reports?from=2026-08-01&to=2026-08-02")
      .set(auth)
      .expect(200);
    expect(empty.body.overview.current).toMatchObject({
      netSales: 0,
      averageOrder: 0,
      margin: null,
      netProfit: 0,
    });
    expect(empty.body.overview.previous).toMatchObject({
      from: "2026-07-30",
      to: "2026-07-31",
      netSales: 0,
    });
  });
});
