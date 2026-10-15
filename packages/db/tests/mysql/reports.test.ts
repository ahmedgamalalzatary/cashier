import { it, testBranchValues } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { orders, users } from "@cashier/db";
import { db } from "../support/api-setup.js";
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
});
