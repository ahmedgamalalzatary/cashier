import { it, testBranchValues } from "../support/ids.js";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { shifts } from "@cashier/db";
import { db } from "../support/api-setup.js";
import { app, createCashier } from "../support/shifts-fixtures.js";

describe("shift history", () => {
  it("rejects reopening while any cashier occupies the branch, then permits it after closing", async () => {
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
    const otherOpened = await request(app())
      .post("/api/shifts/open")
      .set(other.authorization)
      .send({ openingFloat: 20 })
      .expect(201);
    await request(app())
      .post(`/api/shifts/${old.body.id}/reopen`)
      .set(first.adminAuthorization)
      .send({ note: "Branch occupied" })
      .expect(409);
    await request(app())
      .post(`/api/shifts/${otherOpened.body.id}/close`)
      .set(other.authorization)
      .send({ actualCash: 20 })
      .expect(200);
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
      testBranchValues(
        Array.from({ length: 105 }, (_, index) => ({
          cashierUserId: first.userId,
          employeeId: first.employeeId,
          status: "closed" as const,
          openingFloat: "0.00",
          openedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          closedAt: new Date(Date.UTC(2026, 0, 1, 0, index + 1)),
        })),
      ),
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
        (shift: { cashierUserId: string }) =>
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
      testBranchValues(
        Array.from({ length: 105 }, () => ({
          cashierUserId: cashier.userId,
          employeeId: cashier.employeeId,
          status: "closed" as const,
          openingFloat: "0.00",
          openedAt: new Date(),
          closedAt: new Date(),
        })),
      ),
    );
    const today = await request(app())
      .get("/api/shifts/today")
      .set(cashier.authorization);
    expect(today.status).toBe(200);
    expect(today.body).toHaveLength(105);
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
      cashierHistory.body.map((shift: { id: string }) => shift.id),
    ).toEqual([firstShift.body.id]);
    expect(adminHistory.body.map((shift: { id: string }) => shift.id)).toEqual([
      secondShift.body.id,
      firstShift.body.id,
    ]);
  });
});
