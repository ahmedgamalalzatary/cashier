import { it, testBranchValues } from "../support/ids.js";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
  categories,
  expenseCategories,
  expenses,
  externalCategories,
  externalProductIngredients,
  externalProducts,
  items,
  orders,
  refunds,
  shiftEvents,
  shifts,
  stockBatches,
  stockMovements,
  transferRequests,
  wasteEntries,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { app, createCashier } from "../support/shifts-fixtures.js";
import { randomUUID } from "node:crypto";

describe("shift closing and corrections", () => {
  it("keeps every transaction and cash total with its cashier across consecutive branch shifts", async () => {
    const first = await createCashier("actions-first");
    const second = await createCashier(
      "actions-second",
      "Second",
      first.adminAuthorization,
    );
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "Stock" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "Beans",
          categoryId: category.id,
          type: "raw",
          stockUnit: "kg",
        }),
      )
      .$returningId();
    const [batch] = await db
      .insert(stockBatches)
      .values(
        testBranchValues({
          itemId: item.id,
          warehouse: "cafe",
          initialQuantity: "10.000",
          remainingQuantity: "10.000",
          unitCost: "2.000000",
          receivedAt: new Date(),
          sourceType: "transfer_in",
        }),
      )
      .$returningId();
    await db.insert(stockMovements).values(
      testBranchValues({
        itemId: item.id,
        warehouse: "cafe",
        batchId: batch.id,
        movementType: "transfer_in",
        quantity: "10.000",
        unitCost: "2.000000",
        occurredAt: new Date(),
      }),
    );
    await db.insert(externalCategories).values(
      testBranchValues({
        externalId: 3,
        nameAr: "Drinks",
        nameEn: "Drinks",
        displayOrder: 1,
        isActive: true,
        isVisible: true,
        isCurrent: true,
        syncedAt: new Date(),
      }),
    );
    await db.insert(externalProducts).values(
      testBranchValues({
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
      }),
    );
    await db.insert(externalProductIngredients).values(
      testBranchValues({
        externalProductId: 9,
        itemId: item.id,
        quantity: "0.020",
      }),
    );
    const [expenseCategory] = await db
      .insert(expenseCategories)
      .values(testBranchValues({ name: "Cleaning" }))
      .$returningId();
    for (const [index, cashier] of [first, second].entries()) {
      const opened = await request(app())
        .post("/api/shifts/open")
        .set(cashier.authorization)
        .send({ openingFloat: 100 })
        .expect(201);
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
          categoryId: expenseCategory.id,
          amount: index + 2,
        })
        .expect(201);
      await request(app())
        .post("/api/waste")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          warehouse: "cafe",
          target: { type: "item", itemId: item.id },
          quantity: 0.01,
          reason: "damaged",
        })
        .expect(201);
      await request(app())
        .post("/api/transfers/requests")
        .set(cashier.authorization)
        .send({
          clientRequestId: randomUUID(),
          lines: [{ itemId: item.id, quantity: 1 }],
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
          .where(eq(table.shiftId, opened.body.id));
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
        .post(`/api/shifts/${opened.body.id}/close`)
        .set(cashier.authorization)
        .send({ actualCash: index === 0 ? 98 : 117 })
        .expect(200);
      expect(closed.body.expectedCash).toBe(index === 0 ? "98.00" : "117.00");
      expect(closed.body.overShort).toBe("0.00");
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
    await db.insert(orders).values(
      testBranchValues({
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
      }),
    );

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
