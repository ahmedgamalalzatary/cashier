import request from "supertest";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { orders, shiftEvents, shifts } from "../../../src/db/schema.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);

async function createCashier(
  username = "shift-cashier",
  employeeName = "كاشير الوردية",
  existingAdminAuthorization?: { Authorization: string },
) {
  const adminAuthorization =
    existingAdminAuthorization ?? (await loginAs(app(), "admin"));
  const employee = await request(app())
    .post("/api/employees")
    .set(adminAuthorization)
    .send({ name: employeeName });
  const access = await request(app())
    .post(`/api/employees/${employee.body.id}/cashier-access`)
    .set(adminAuthorization)
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

  it("allows only one open shift across concurrent cashier attempts", async () => {
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
      201, 409,
    ]);
  });

  it("shows the single current shift to cashiers and administrators", async () => {
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
    expect(adminView.body.id).toBe(opened.body.id);
  });

  it("only tells another cashier that the drawer is occupied", async () => {
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
    expect(response.body).toEqual({ occupied: true });
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
