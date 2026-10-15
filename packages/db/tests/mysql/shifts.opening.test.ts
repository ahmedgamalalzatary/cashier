import { it, testId } from "../support/ids.js";
import request from "supertest";
import { describe, expect } from "vitest";
import { loginAs } from "../support/api-helpers.js";
import { app, createCashier } from "../support/shifts-fixtures.js";

describe("cashier shift opening", () => {
  it("opens a cashier shift linked to the authenticated user and employee", async () => {
    const cashier = await createCashier();

    const response = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 500 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
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

  it("allows exactly one cashier to win a concurrent branch shift opening", async () => {
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
    for (const [index, cashier] of [firstCashier, secondCashier].entries()) {
      const current = await request(app())
        .get("/api/shifts/current")
        .set(cashier.authorization);
      if (responses[index]!.status === 201) {
        expect(current.body.id).toBe(responses[index]!.body.id);
        expect(current.body.cashierUserId).toBe(cashier.userId);
      } else {
        expect(current.body).toBeNull();
      }
    }
    const active = await request(app())
      .get("/api/shifts/active")
      .set(firstCashier.adminAuthorization);
    expect(active.status).toBe(200);
    expect(active.body).toHaveLength(1);
    const dashboard = await request(app())
      .get("/api/reports/dashboard")
      .set(firstCashier.adminAuthorization);
    expect(
      dashboard.body.openShifts.map((shift: { id: string }) => shift.id).sort(),
    ).toEqual(
      responses
        .filter((response) => response.status === 201)
        .map((response) => response.body.id),
    );
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
    for (const [index, branchId] of [testId(1), branch.body.id].entries()) {
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
        expect(result.body.map((shift: { id: string }) => shift.id)).toEqual([
          opened[index]!.body.id,
        ]);
      }
      const dashboard = await request(app())
        .get("/api/reports/dashboard")
        .set(first.adminAuthorization)
        .set("X-Branch-Id", String(branchId))
        .expect(200);
      expect(
        dashboard.body.openShifts.map((shift: { id: string }) => shift.id),
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
});
