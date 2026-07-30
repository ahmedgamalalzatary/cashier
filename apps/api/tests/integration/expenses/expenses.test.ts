import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let adminAuth: { readonly Authorization: string };
let cashierAuth: { readonly Authorization: string };

beforeEach(async () => {
  adminAuth = await loginAs(app(), "admin");
  cashierAuth = await loginAs(app(), "cashier");
});

async function createCategory(name = "نظافة") {
  return request(app())
    .post("/api/expenses/categories")
    .set(adminAuth)
    .send({ name });
}

describe("expenses", () => {
  it("allows admins to manage flat expense categories", async () => {
    const created = await createCategory();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "نظافة", isActive: true });

    const updated = await request(app())
      .patch(`/api/expenses/categories/${created.body.id}`)
      .set(adminAuth)
      .send({ name: "تنظيف", isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "تنظيف", isActive: false });
  });

  it("prevents cashiers from managing expense categories", async () => {
    const response = await request(app())
      .post("/api/expenses/categories")
      .set(cashierAuth)
      .send({ name: "ممنوع" });
    expect(response.status).toBe(403);
  });

  it("records a cashier expense against the owned open shift", async () => {
    const category = await createCategory();
    await request(app())
      .post("/api/shifts/open")
      .set(cashierAuth)
      .send({ openingFloat: 100 });

    const response = await request(app())
      .post("/api/expenses")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 12.5,
        note: "من الدرج",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: "shift",
      categoryName: "نظافة",
      amount: "12.50",
      note: "من الدرج",
    });
    expect(response.body.shiftId).toEqual(expect.any(Number));

    const shift = await request(app())
      .get("/api/shifts/current")
      .set(cashierAuth);
    expect(shift.body.totals.expenses).toBe("12.50");

    const closed = await request(app())
      .post(`/api/shifts/${response.body.shiftId}/close`)
      .set(cashierAuth)
      .send({ actualCash: 87.5 });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      expectedCash: "87.50",
      overShort: "0.00",
    });
  });

  it("subtracts expenses when an admin closes and corrects a shift", async () => {
    const category = await createCategory();
    const opened = await request(app())
      .post("/api/shifts/open")
      .set(cashierAuth)
      .send({ openingFloat: 100 });
    await request(app())
      .post("/api/expenses")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 12.5,
        note: null,
      });

    const closed = await request(app())
      .post(`/api/shifts/${opened.body.id}/admin-close`)
      .set(adminAuth)
      .send({ actualCash: 90, note: "إغلاق إداري" });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      expectedCash: "87.50",
      overShort: "2.50",
    });

    const corrected = await request(app())
      .put(`/api/shifts/${opened.body.id}/correction`)
      .set(adminAuth)
      .send({
        openingFloat: 110,
        actualCash: 95,
        note: "تصحيح",
      });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({
      expectedCash: "97.50",
      overShort: "-2.50",
    });
  });

  it("blocks cashier expenses without an owned open shift", async () => {
    const category = await createCategory();
    const response = await request(app())
      .post("/api/expenses")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 5,
        note: null,
      });
    expect(response.status).toBe(409);
  });

  it("allows admins to record dated general expenses without a shift", async () => {
    const category = await createCategory("إيجار");
    const response = await request(app())
      .post("/api/expenses")
      .set(adminAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 5000,
        expenseDate: "2026-07-01",
        note: "إيجار يوليو",
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: "general",
      shiftId: null,
      amount: "5000.00",
      expenseDate: "2026-07-01",
    });
  });

  it("rejects expenses assigned to an inactive category", async () => {
    const category = await createCategory();
    await request(app())
      .patch(`/api/expenses/categories/${category.body.id}`)
      .set(adminAuth)
      .send({ isActive: false });

    const response = await request(app())
      .post("/api/expenses")
      .set(adminAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 10,
        expenseDate: "2026-07-01",
        note: null,
      });
    expect(response.status).toBe(409);
  });

  it("only lists the authenticated cashier's own shift expenses", async () => {
    const category = await createCategory();
    await request(app())
      .post("/api/shifts/open")
      .set(cashierAuth)
      .send({ openingFloat: 100 });
    const created = await request(app())
      .post("/api/expenses")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 10,
        note: null,
      });
    await request(app())
      .post(`/api/shifts/${created.body.shiftId}/close`)
      .set(cashierAuth)
      .send({ actualCash: 90 });

    await request(app())
      .post("/api/expenses")
      .set(adminAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        categoryId: category.body.id,
        amount: 20,
        expenseDate: "2026-07-01",
        note: null,
      });

    const cashierList = await request(app())
      .get("/api/expenses")
      .set(cashierAuth);
    expect(cashierList.status).toBe(200);
    expect(cashierList.body).toHaveLength(1);
    expect(cashierList.body[0].id).toBe(created.body.id);

    const adminList = await request(app()).get("/api/expenses").set(adminAuth);
    expect(adminList.body).toHaveLength(2);
  });

  it("replays a client request without creating another expense", async () => {
    const category = await createCategory();
    const body = {
      clientRequestId: crypto.randomUUID(),
      categoryId: category.body.id,
      amount: 10,
      expenseDate: "2026-07-01",
      note: null,
    };
    const first = await request(app())
      .post("/api/expenses")
      .set(adminAuth)
      .send(body);
    const replay = await request(app())
      .post("/api/expenses")
      .set(adminAuth)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const list = await request(app()).get("/api/expenses").set(adminAuth);
    expect(list.body).toHaveLength(1);
  });
});
