import request from "supertest";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import { orders, shiftEvents, shifts } from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { randomUUID } from "node:crypto";
import {
  categories,
  externalCategories,
  externalProducts,
  externalProductIngredients,
  items,
  expenseCategories,
  expenses,
  refunds,
  wasteEntries,
  transferRequests,
  stockBatches,
  stockMovements,
} from "@cashier/db";
import { loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);

async function createCashier(
  username = "shift-cashier",
  employeeName = "كاشير الوردية",
  existingAdminAuthorization?: { Authorization: string },
  branchId = 1,
) {
  const adminAuthorization =
    existingAdminAuthorization ?? (await loginAs(app(), "admin"));
  const employee = await request(app())
    .post("/api/employees")
    .set(adminAuthorization)
    .set("X-Branch-Id", String(branchId))
    .send({ name: employeeName });
  const access = await request(app())
    .post(`/api/employees/${employee.body.id}/cashier-access`)
    .set(adminAuthorization)
    .set("X-Branch-Id", String(branchId))
    .send({ username, password: "secret123" });
  const login = await request(app())
    .post("/api/auth/login")
    .send({ username, password: "secret123" });
  return {
    employeeId: employee.body.id as number,
    userId: access.body.userId as number,
    authorization: {
      Authorization: `Bearer ${login.body.token}`,
    },
    adminAuthorization,
  };
}

describe("shifts", () => {
  it("opens a cashier shift linked to the authenticated user and employee", async () => {
    const cashier = await createCashier();

    const response = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 500 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      status: "open",
      cashierUserId: cashier.userId,
      employeeId: cashier.employeeId,
      cashierName: "كاشير الوردية",
      openingFloat: "500.00",
      closedAt: null,
      workedMinutes: 0,
      totals: {
        ordersCount: 0,
        sales: "0.00",
        discounts: "0.00",
        refunds: "0.00",
        expenses: "0.00",
        wasteEntries: 0,
      },
    });
    expect(response.body.openedAt).toEqual(expect.any(String));
  });

  it("does not let an admin open a cashier shift", async () => {
    const authorization = await loginAs(app(), "admin");

    const response = await request(app())
      .post("/api/shifts/open")
      .set(authorization)
      .send({ openingFloat: 500 });

    expect(response.status).toBe(403);
  });

  it("allows distinct cashiers to open shifts concurrently in the same branch", async () => {
    const firstCashier = await createCashier("first-cashier", "الكاشير الأول");
    const secondCashier = await createCashier(
      "second-cashier",
      "الكاشير الثاني",
      firstCashier.adminAuthorization,
    );

    const responses = await Promise.all([
      request(app())
        .post("/api/shifts/open")
        .set(firstCashier.authorization)
        .send({ openingFloat: 100 }),
      request(app())
        .post("/api/shifts/open")
        .set(secondCashier.authorization)
        .send({ openingFloat: 200 }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    for (const [index, cashier] of [firstCashier, secondCashier].entries()) {
      const current = await request(app())
        .get("/api/shifts/current")
        .set(cashier.authorization);
      expect(current.body.id).toBe(responses[index]!.body.id);
      expect(current.body.cashierUserId).toBe(cashier.userId);
    }
    const active = await request(app())
      .get("/api/shifts/active")
      .set(firstCashier.adminAuthorization);
    expect(active.status).toBe(200);
    expect(active.body).toHaveLength(2);
    const dashboard = await request(app())
      .get("/api/reports/dashboard")
      .set(firstCashier.adminAuthorization);
    expect(
      dashboard.body.openShifts.map((shift: { id: number }) => shift.id).sort(),
    ).toEqual(responses.map((response) => response.body.id).sort());
  });

  it("rejects duplicate concurrent shifts for the same cashier account", async () => {
    const cashier = await createCashier();
    const responses = await Promise.all(
      [100, 200].map((openingFloat) =>
        request(app())
          .post("/api/shifts/open")
          .set(cashier.authorization)
          .send({ openingFloat }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const history = await request(app())
      .get("/api/shifts")
      .set(cashier.authorization);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].events).toHaveLength(1);
  });

  it("supports concurrent branch shifts and isolates active lists, dashboards and administration", async () => {
    const first = await createCashier("branch-first");
    const branch = await request(app())
      .post("/api/branches")
      .set(first.adminAuthorization)
      .send({ name: "Second Branch" })
      .expect(201);
    const second = await createCashier(
      "branch-second",
      "Second",
      first.adminAuthorization,
      branch.body.id,
    );
    const opened = await Promise.all(
      [first, second].map((cashier) =>
        request(app())
          .post("/api/shifts/open")
          .set(cashier.authorization)
          .send({ openingFloat: 100 }),
      ),
    );
    expect(opened.map((response) => response.status)).toEqual([201, 201]);
    for (const [index, branchId] of [1, branch.body.id].entries()) {
      for (const url of [
        "/api/shifts/active",
        "/api/shifts",
        "/api/shifts/today",
      ]) {
        const result = await request(app())
          .get(url)
          .set(first.adminAuthorization)
          .set("X-Branch-Id", String(branchId))
          .expect(200);
        expect(result.body.map((shift: { id: number }) => shift.id)).toEqual([
          opened[index]!.body.id,
        ]);
      }
      const dashboard = await request(app())
        .get("/api/reports/dashboard")
        .set(first.adminAuthorization)
        .set("X-Branch-Id", String(branchId))
        .expect(200);
      expect(
        dashboard.body.openShifts.map((shift: { id: number }) => shift.id),
      ).toEqual([opened[index]!.body.id]);
    }
    await request(app())
      .post(`/api/shifts/${opened[1]!.body.id}/admin-close`)
      .set(first.adminAuthorization)
      .send({ actualCash: 100, note: "Wrong branch" })
      .expect(404);
    await request(app())
      .get("/api/shifts/current")
      .set(first.authorization)
      .set("X-Branch-Id", String(branch.body.id))
      .expect(403);
  });

  it("shows the cashier's own current shift and no personal shift for admins", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 125.5 });

    const cashierView = await request(app())
      .get("/api/shifts/current")
      .set(cashier.authorization);
    const adminView = await request(app())
      .get("/api/shifts/current")
      .set(cashier.adminAuthorization);

    expect(cashierView.status).toBe(200);
    expect(adminView.status).toBe(200);
    expect(cashierView.body.id).toBe(opened.body.id);
    expect(adminView.body).toBeNull();
  });

  it("returns null for a cashier without a shift even when another cashier is working", async () => {
    const owner = await createCashier("drawer-owner");
    const other = await createCashier(
      "other-cashier",
      "كاشير آخر",
      owner.adminAuthorization,
    );
    await request(app())
      .post("/api/shifts/open")
      .set(owner.authorization)
      .send({ openingFloat: 987.65 });

    const response = await request(app())
      .get("/api/shifts/current")
      .set(other.authorization);

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("reopens alongside another cashier but rejects a second shift for its owner", async () => {
    const first = await createCashier("reopen-first");
    const other = await createCashier(
      "reopen-other",
      "Other",
      first.adminAuthorization,
    );
    const old = await request(app())
      .post("/api/shifts/open")
      .set(first.authorization)
      .send({ openingFloat: 10 });
    await request(app())
      .post(`/api/shifts/${old.body.id}/close`)
      .set(first.authorization)
      .send({ actualCash: 10 })
      .expect(200);
    await request(app())
      .post("/api/shifts/open")
      .set(other.authorization)
      .send({ openingFloat: 20 })
      .expect(201);
    await request(app())
      .post(`/api/shifts/${old.body.id}/reopen`)
      .set(first.adminAuthorization)
      .send({ note: "Resume" })
      .expect(200);
    await request(app())
      .post(`/api/shifts/${old.body.id}/close`)
      .set(first.authorization)
      .send({ actualCash: 10 })
      .expect(200);
    await request(app())
      .post("/api/shifts/open")
      .set(first.authorization)
      .send({ openingFloat: 30 })
      .expect(201);
    await request(app())
      .post(`/api/shifts/${old.body.id}/reopen`)
      .set(first.adminAuthorization)
      .send({ note: "Duplicate" })
      .expect(409);
    const saved = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, old.body.id));
    expect(saved[0]!.status).toBe("closed");
  });

  it("paginates past 100 shifts without exposing another cashier's history", async () => {
    const first = await createCashier("history-many");
    const other = await createCashier(
      "history-other",
      "Other",
      first.adminAuthorization,
    );
    await db.insert(shifts).values(
      Array.from({ length: 105 }, (_, index) => ({
        cashierUserId: first.userId,
        employeeId: first.employeeId,
        status: "closed" as const,
        openingFloat: "0.00",
        openedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        closedAt: new Date(Date.UTC(2026, 0, 1, 0, index + 1)),
      })),
    );
    await request(app())
      .post("/api/shifts/open")
      .set(other.authorization)
      .send({ openingFloat: 20 })
      .expect(201);
    const page1 = await request(app())
      .get("/api/shifts?limit=100&offset=0")
      .set(first.authorization);
    const page2 = await request(app())
      .get("/api/shifts?limit=100&offset=100")
      .set(first.authorization);
    expect(page1.body).toHaveLength(100);
    expect(page2.body).toHaveLength(5);
    expect(
      new Set([...page1.body, ...page2.body].map((shift) => shift.id)).size,
    ).toBe(105);
    expect(
      page2.body.every(
        (shift: { cashierUserId: number }) =>
          shift.cashierUserId === first.userId,
      ),
    ).toBe(true);
    await request(app())
      .get("/api/shifts?offset=-1")
      .set(first.authorization)
      .expect(400);
    await request(app())
      .get("/api/shifts?limit=101")
      .set(first.authorization)
      .expect(400);
    await request(app())
      .get("/api/shifts/active")
      .set(first.authorization)
      .expect(403);
  });

  it("returns all of today's shifts for Home even beyond the history page size", async () => {
    const cashier = await createCashier();
    await db.insert(shifts).values(
      Array.from({ length: 105 }, () => ({
        cashierUserId: cashier.userId,
        employeeId: cashier.employeeId,
        status: "closed" as const,
        openingFloat: "0.00",
        openedAt: new Date(),
        closedAt: new Date(),
      })),
    );
    const today = await request(app())
      .get("/api/shifts/today")
      .set(cashier.authorization);
    expect(today.status).toBe(200);
    expect(today.body).toHaveLength(105);
  });

  it("keeps every transaction and cash total with its cashier while two shifts are open", async () => {
    const first = await createCashier("actions-first");
    const second = await createCashier(
      "actions-second",
      "Second",
      first.adminAuthorization,
    );
    const opened = await Promise.all(
      [first, second].map((cashier) =>
        request(app())
          .post("/api/shifts/open")
          .set(cashier.authorization)
          .send({ openingFloat: 100 }),
      ),
    );
    expect(opened.map((response) => response.status)).toEqual([201, 201]);
    const [category] = await db.insert(categories).values({ name: "Stock" });
    const [item] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "Beans",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "kg",
    });
    const [batch] = await db.insert(stockBatches).values({
      itemId: item.insertId,
      warehouse: "cafe",
      initialQuantity: "10.000",
      remainingQuantity: "10.000",
      unitCost: "2.000000",
      receivedAt: new Date(),
      sourceType: "transfer_in",
    });
    await db.insert(stockMovements).values({
      itemId: item.insertId,
      warehouse: "cafe",
      batchId: batch.insertId,
      movementType: "transfer_in",
      quantity: "10.000",
      unitCost: "2.000000",
      occurredAt: new Date(),
    });
    await db.insert(externalCategories).values({
      externalId: 3,
      nameAr: "Drinks",
      nameEn: "Drinks",
      displayOrder: 1,
      isActive: true,
      isVisible: true,
      isCurrent: true,
      syncedAt: new Date(),
    });
    await db.insert(externalProducts).values({
      externalId: 9,
      externalCategoryId: 3,
      nameAr: "Coffee",
      nameEn: "Coffee",
      price: "20.00",
      calories: 0,
      pointsReward: 0,
      isAvailable: true,
      isVisible: true,
      isCurrent: true,
      syncedAt: new Date(),
    });
    await db.insert(externalProductIngredients).values({
      externalProductId: 9,
      itemId: item.insertId,
      quantity: "0.020",
    });
    const [expenseCategory] = await db
      .insert(expenseCategories)
      .values({ name: "Cleaning" });
    for (const [index, cashier] of [first, second].entries()) {
      const sale = await request(app())
        .post("/api/orders")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          lines: [
            {
              type: "external_product",
              externalProductId: 9,
              externalSizeId: null,
              quantity: index + 1,
              modifiers: [],
            },
          ],
          discount: null,
          cashReceived: 40,
        })
        .expect(201);
      await request(app())
        .post("/api/refunds")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          orderId: sale.body.id,
          reason: "Return",
          lines: [
            {
              orderLineId: sale.body.lines[0].id,
              quantity: 1,
              stockAction: "return_to_stock",
            },
          ],
        })
        .expect(201);
      await request(app())
        .post("/api/expenses")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          categoryId: expenseCategory.insertId,
          amount: index + 2,
        })
        .expect(201);
      await request(app())
        .post("/api/waste")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          warehouse: "cafe",
          target: { type: "item", itemId: item.insertId },
          quantity: 0.01,
          reason: "damaged",
        })
        .expect(201);
      await request(app())
        .post("/api/transfers/requests")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          lines: [{ itemId: item.insertId, quantity: 1 }],
          notes: null,
        })
        .expect(201);
      for (const table of [
        orders,
        refunds,
        expenses,
        wasteEntries,
        transferRequests,
      ]) {
        const documents = await db
          .select({ shiftId: table.shiftId })
          .from(table)
          .where(eq(table.shiftId, opened[index]!.body.id));
        expect(documents).toHaveLength(1);
      }
      const current = await request(app())
        .get("/api/shifts/current")
        .set(cashier.authorization);
      expect(current.body.totals).toMatchObject({
        sales: index === 0 ? "20.00" : "40.00",
        refunds: "20.00",
        expenses: index === 0 ? "2.00" : "3.00",
        ordersCount: 1,
        wasteEntries: 1,
        transferRequests: 1,
      });
      const closed = await request(app())
        .post(`/api/shifts/${opened[index]!.body.id}/close`)
        .set(cashier.authorization)
        .send({ actualCash: index === 0 ? 98 : 117 })
        .expect(200);
      expect(closed.body.expectedCash).toBe(index === 0 ? "98.00" : "117.00");
      expect(closed.body.overShort).toBe("0.00");
    }
  });

  it("rejects null and blank drawer amounts instead of coercing them to zero", async () => {
    const cashier = await createCashier();

    for (const openingFloat of [null, ""]) {
      expect(
        (
          await request(app())
            .post("/api/shifts/open")
            .set(cashier.authorization)
            .send({ openingFloat })
        ).status,
      ).toBe(400);
    }

    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 0 });
    for (const actualCash of [null, ""]) {
      expect(
        (
          await request(app())
            .post(`/api/shifts/${opened.body.id}/close`)
            .set(cashier.authorization)
            .send({ actualCash })
        ).status,
      ).toBe(400);
    }
  });

  it("lets the owning cashier close and reconciles expected versus actual cash", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 500 });

    const closed = await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 490 });

    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      id: opened.body.id,
      status: "closed",
      openingFloat: "500.00",
      actualCash: "490.00",
      expectedCash: "500.00",
      overShort: "-10.00",
      workedMinutes: expect.any(Number),
    });
    expect(closed.body.closedAt).toEqual(expect.any(String));
    expect(
      closed.body.events.map((event: { action: string }) => event.action),
    ).toEqual(["open", "close"]);
    const current = await request(app())
      .get("/api/shifts/current")
      .set(cashier.authorization);
    expect(current.body).toBeNull();
  });

  it("includes shift sales and discounts in running totals and reconciliation", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 500 });
    await db.insert(orders).values({
      orderNumber: "POS-SHIFT-TOTAL",
      clientRequestId: "39bd97c9-7d85-4408-a4f8-b0ae4b3328e8",
      requestFingerprint: "a".repeat(64),
      cashierId: cashier.userId,
      shiftId: opened.body.id,
      subtotal: "80.00",
      discountType: "fixed",
      discountValue: "8.00",
      discountAmount: "8.00",
      total: "72.00",
      cashReceived: "100.00",
      changeAmount: "28.00",
    });

    const current = await request(app())
      .get("/api/shifts/current")
      .set(cashier.authorization);
    expect(current.body.totals).toMatchObject({
      ordersCount: 1,
      sales: "72.00",
      discounts: "8.00",
    });

    const closed = await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 570 });
    expect(closed.body).toMatchObject({
      expectedCash: "572.00",
      overShort: "-2.00",
    });
  });

  it("does not let one cashier close another cashier's shift", async () => {
    const owner = await createCashier("owner", "صاحب الوردية");
    const other = await createCashier(
      "other",
      "كاشير آخر",
      owner.adminAuthorization,
    );
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(owner.authorization)
      .send({ openingFloat: 100 });

    const response = await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(other.authorization)
      .send({ actualCash: 100 });

    expect(response.status).toBe(403);
  });

  it("lets an admin force-close an abandoned shift with an audit note", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 100 });

    const response = await request(app())
      .post(`/api/shifts/${opened.body.id}/admin-close`)
      .set(cashier.adminAuthorization)
      .send({
        actualCash: 95,
        note: "غادر الكاشير دون إغلاق الوردية",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "closed",
      actualCash: "95.00",
      expectedCash: "100.00",
      overShort: "-5.00",
    });
    expect(response.body.events).toContainEqual(
      expect.objectContaining({
        action: "admin_close",
        note: "غادر الكاشير دون إغلاق الوردية",
        openingFloat: "100.00",
      }),
    );
  });

  it("lets an admin reopen a closed shift with an audit note", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 100 });
    await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 100 });

    const reopened = await request(app())
      .post(`/api/shifts/${opened.body.id}/reopen`)
      .set(cashier.adminAuthorization)
      .send({ note: "تم الإغلاق بالخطأ" });

    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({
      status: "open",
      closedAt: null,
      actualCash: null,
      expectedCash: null,
      overShort: null,
    });
    expect(reopened.body.events).toContainEqual(
      expect.objectContaining({
        action: "reopen",
        note: "تم الإغلاق بالخطأ",
      }),
    );
    expect(
      (
        await request(app())
          .post(`/api/shifts/${opened.body.id}/close`)
          .set(cashier.authorization)
          .send({ actualCash: 100 })
      ).status,
    ).toBe(200);
  });

  it("does not reopen a shift after cashier access is revoked", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 0 });
    await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 0 });
    await request(app())
      .delete(`/api/employees/${cashier.employeeId}/cashier-access`)
      .set(cashier.adminAuthorization);

    const response = await request(app())
      .post(`/api/shifts/${opened.body.id}/reopen`)
      .set(cashier.adminAuthorization)
      .send({ note: "محاولة غير صالحة" });

    expect(response.status).toBe(409);
  });

  it("does not reopen a shift for a deactivated employee", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 0 });
    await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 0 });
    await request(app())
      .delete(`/api/employees/${cashier.employeeId}`)
      .set(cashier.adminAuthorization);

    const response = await request(app())
      .post(`/api/shifts/${opened.body.id}/reopen`)
      .set(cashier.adminAuthorization)
      .send({ note: "محاولة غير صالحة" });

    expect(response.status).toBe(409);
  });

  it("lets an admin correct a closed shift's cash counts with an audit note", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 100 });
    await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 90 });

    const corrected = await request(app())
      .put(`/api/shifts/${opened.body.id}/correction`)
      .set(cashier.adminAuthorization)
      .send({
        openingFloat: 110,
        actualCash: 108,
        note: "تصحيح عدّ النقدية",
      });

    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({
      status: "closed",
      openingFloat: "110.00",
      actualCash: "108.00",
      expectedCash: "110.00",
      overShort: "-2.00",
    });
    expect(corrected.body.events).toContainEqual(
      expect.objectContaining({
        action: "correction",
        note: "تصحيح عدّ النقدية",
      }),
    );
  });

  it("lists all shift history for admins but only the cashier's own history", async () => {
    const first = await createCashier("first-history", "الكاشير الأول");
    const second = await createCashier(
      "second-history",
      "الكاشير الثاني",
      first.adminAuthorization,
    );
    const firstShift = await request(app())
      .post("/api/shifts/open")
      .set(first.authorization)
      .send({ openingFloat: 10 });
    await request(app())
      .post(`/api/shifts/${firstShift.body.id}/close`)
      .set(first.authorization)
      .send({ actualCash: 10 });
    const secondShift = await request(app())
      .post("/api/shifts/open")
      .set(second.authorization)
      .send({ openingFloat: 20 });
    await request(app())
      .post(`/api/shifts/${secondShift.body.id}/close`)
      .set(second.authorization)
      .send({ actualCash: 20 });

    const cashierHistory = await request(app())
      .get("/api/shifts")
      .set(first.authorization);
    const adminHistory = await request(app())
      .get("/api/shifts")
      .set(first.adminAuthorization);

    expect(cashierHistory.status).toBe(200);
    expect(
      cashierHistory.body.map((shift: { id: number }) => shift.id),
    ).toEqual([firstShift.body.id]);
    expect(adminHistory.body.map((shift: { id: number }) => shift.id)).toEqual([
      secondShift.body.id,
      firstShift.body.id,
    ]);
  });

  it("counts the shift duration as the cashier's worked time", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 0 });
    await db
      .update(shifts)
      .set({ openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(shifts.id, opened.body.id));

    const closed = await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 0 });

    expect(closed.body.workedMinutes).toBeGreaterThanOrEqual(119);
    expect(closed.body.workedMinutes).toBeLessThanOrEqual(120);
  });

  it("excludes the closed gap from worked time after a reopen", async () => {
    const cashier = await createCashier();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 0 });
    await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 0 });

    const firstOpenedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const firstClosedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db
      .update(shifts)
      .set({ openedAt: firstOpenedAt, closedAt: firstClosedAt })
      .where(eq(shifts.id, opened.body.id));
    await db
      .update(shiftEvents)
      .set({ occurredAt: firstClosedAt })
      .where(
        and(
          eq(shiftEvents.shiftId, opened.body.id),
          eq(shiftEvents.action, "close"),
        ),
      );

    await request(app())
      .post(`/api/shifts/${opened.body.id}/reopen`)
      .set(cashier.adminAuthorization)
      .send({ note: "استكمال العمل" });
    const closed = await request(app())
      .post(`/api/shifts/${opened.body.id}/close`)
      .set(cashier.authorization)
      .send({ actualCash: 0 });

    expect(closed.body.workedMinutes).toBeGreaterThanOrEqual(119);
    expect(closed.body.workedMinutes).toBeLessThanOrEqual(120);
  });
});
