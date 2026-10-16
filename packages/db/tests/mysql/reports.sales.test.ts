import { it, testBranchValues } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
  categories,
  items,
  orders,
  purchaseInvoices,
  purchaseLines,
  refunds,
  shiftEvents,
  shifts,
  stockMovements,
  supplierPayments,
  suppliers,
  users,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import {
  app,
  createExternalCategoryFixture,
  sellLatte,
} from "../support/reports-fixtures.js";

describe("reports", () => {
  it("separates current supplier balances from dated purchases and payments", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "Supplier", openingBalance: "10.00" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "Supplies" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "Milk",
          type: "raw",
          categoryId: category.id,
          stockUnit: "litre",
        }),
      )
      .$returningId();
    for (const purchasedAt of ["2026-09-11", "2026-09-12"]) {
      const [invoice] = await db
        .insert(purchaseInvoices)
        .values(
          testBranchValues({
            supplierId: supplier.id,
            invoiceNumber: purchasedAt,
            purchasedAt,
            createdBy: admin.id,
            totalAmount: "20.00",
            paidAmount: "5.00",
            clientRequestId: randomUUID(),
            requestFingerprint: "fixture",
          }),
        )
        .$returningId();
      await db.insert(purchaseLines).values(
        testBranchValues({
          invoiceId: invoice.id,
          itemId: item.id,
          quantity: "2.000",
          stockQuantity: "2.000",
          unitMode: "stock",
          unitPrice: "10.00",
          unitCost: "10.000000",
          lineTotal: "20.00",
        }),
      );
      await db.insert(supplierPayments).values(
        testBranchValues({
          supplierId: supplier.id,
          purchaseInvoiceId: invoice.id,
          amount: "5.00",
          paidAt: purchasedAt,
        }),
      );
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
    expect(report.body.suppliers.payments[0].purchaseInvoiceId).toBe(
      report.body.suppliers.purchases[0].id,
    );
    expect(report.body.suppliers.payments[0].purchaseInvoiceNumber).toBe(
      "2026-09-11",
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
    const [shift] = await db
      .insert(shifts)
      .values(
        testBranchValues({
          cashierUserId: cashier.id,
          employeeId: cashier.employeeId!,
          status: "closed",
          openingFloat: "10.00",
          openedAt: new Date("2026-09-10T18:00:00Z"),
          closedAt: new Date("2026-09-12T10:00:00Z"),
          overShort: "3.00",
        }),
      )
      .$returningId();
    for (const [action, occurredAt] of [
      ["open", "2026-09-10T18:00:00Z"],
      ["close", "2026-09-10T23:00:00Z"],
      ["reopen", "2026-09-11T18:00:00Z"],
      ["close", "2026-09-12T10:00:00Z"],
    ] as const)
      await db.insert(shiftEvents).values(
        testBranchValues({
          shiftId: shift.id,
          action,
          actorUserId: cashier.id,
          occurredAt: new Date(occurredAt),
          overShort: action === "close" ? "3.00" : null,
        }),
      );
    const saleIds: string[] = [];
    for (const [total, cost, discount, createdAt] of [
      [100, 20, 10, "2026-09-10T20:59:59Z"],
      [80, 16, 5, "2026-09-10T21:00:00Z"],
      [60, 12, 2, "2026-09-11T20:59:59Z"],
      [200, 40, 20, "2026-09-11T21:00:00Z"],
    ] as const) {
      const id = randomUUID();
      const [sale] = await db
        .insert(orders)
        .values(
          testBranchValues({
            orderNumber: id,
            clientRequestId: id,
            requestFingerprint: "fixture",
            cashierId: cashier.id,
            shiftId: shift.id,
            subtotal: String(total + discount),
            total: String(total),
            totalCost: String(cost),
            discountAmount: String(discount),
            cashReceived: String(total),
            changeAmount: "0.00",
            createdAt: new Date(createdAt),
          }),
        )
        .$returningId();
      saleIds.push(sale.id);
    }
    for (const [amount, returnedCost, createdAt] of [
      [15, 3, "2026-09-11T12:00:00Z"],
      [20, 4, "2026-09-12T12:00:00Z"],
    ] as const)
      await db.insert(refunds).values(
        testBranchValues({
          clientRequestId: randomUUID(),
          requestFingerprint: "fixture",
          orderId: saleIds[0]!,
          cashierId: cashier.id,
          shiftId: shift.id,
          reason: "fixture",
          amount: String(amount),
          totalCostReturned: String(returnedCost),
          createdAt: new Date(createdAt),
        }),
      );
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

  it("names each document by its own number so no raw ID reaches the screen", async () => {
    const admin = await loginAs(app, "admin");
    const cashier = await loginAs(app, "cashier");
    await request(app)
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
    const [order] = await db.select().from(orders).where(eq(orders.id, sale.id));
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());

    const { body } = await request(app)
      .get(`/api/reports?from=${today}&to=${today}`)
      .set(admin)
      .expect(200);

    expect(body.wasteAndRefunds.refunds[0]).toMatchObject({
      id: refund.body.id,
      orderId: sale.id,
      orderNumber: order.orderNumber,
    });
    const sold = body.stock.ledger.find(
      (row: { referenceType: string }) => row.referenceType === "order",
    );
    expect(sold).toMatchObject({
      referenceId: sale.id,
      referenceLabel: order.orderNumber,
    });
    const cash = (type: string) =>
      body.money.cashFlow.find((row: { type: string }) => row.type === type);
    expect(cash("sale")).toMatchObject({
      referenceId: sale.id,
      reference: order.orderNumber,
    });
    expect(cash("refund")).toMatchObject({
      referenceId: refund.body.id,
      reference: order.orderNumber,
    });
  });

  it("includes negative stock without a minimum in dashboard and report alerts", async () => {
    const auth = await loginAs(app, "admin");
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "Stock alerts" }))
      .$returningId();
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
      const [item] = await db
        .insert(items)
        .values(
          testBranchValues({
            code: nextTestItemCode(),
            name: fixture.name,
            categoryId: category.id,
            type: "raw",
            stockUnit: "kg",
            cafeMinimumLevel: fixture.minimum,
            isActive: fixture.isActive,
          }),
        )
        .$returningId();
      if (fixture.quantity !== "0.000") {
        await db.insert(stockMovements).values(
          testBranchValues({
            itemId: item.id,
            warehouse: "cafe",
            movementType: "adjustment",
            quantity: fixture.quantity,
            unitCost: "0.000000",
            occurredAt: new Date("2026-09-01T10:00:00Z"),
          }),
        );
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
      const [shift] = await db
        .insert(shifts)
        .values(
          testBranchValues({
            cashierUserId: cashier.id,
            employeeId: cashier.employeeId!,
            status: "closed",
            openingFloat: "0.00",
            openedAt: new Date("2026-09-10T08:00:00.000Z"),
            closedAt: new Date(lastClose),
          }),
        )
        .$returningId();
      await db.insert(shiftEvents).values(
        testBranchValues([
          {
            shiftId: shift.id,
            action: "open",
            actorUserId: cashier.id,
            occurredAt: new Date("2026-09-10T08:00:00.000Z"),
          },
          {
            shiftId: shift.id,
            action: "close",
            actorUserId: cashier.id,
            occurredAt: new Date(firstClose),
          },
          {
            shiftId: shift.id,
            action: "reopen",
            actorUserId: admin.id,
            occurredAt: new Date(reopen),
          },
          {
            shiftId: shift.id,
            action: "close",
            actorUserId: admin.id,
            occurredAt: new Date(lastClose),
          },
        ]),
      );

      const report = await request(app)
        .get("/api/reports?from=2026-09-01&to=2026-09-30")
        .set(adminAuthorization);

      expect(report.status).toBe(200);
      const row = report.body.employees.activity.find(
        (entry: { id: string }) => entry.id === cashier.employeeId,
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
        (entry: { id: string }) => entry.id === shift.id,
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
          .where(eq(shifts.id, shift.id));
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
