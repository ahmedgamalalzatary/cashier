import { it, testId } from "../support/ids.js";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { MAX_SHIFT_HOURS } from "@cashier/shared";
import { shiftEvents, shifts } from "@cashier/db";
import { ShiftsService } from "../../../../apps/api/src/modules/shifts/shifts.service.js";
import { ShiftsRepository } from "../../../../apps/api/src/modules/shifts/shifts.repository.js";
import {
  autoCloseExpiredBranches,
  createAutoCloseForDb,
} from "../../../../apps/api/src/modules/shifts/auto-close.js";
import { db } from "../support/api-setup.js";
import { app, createCashier } from "../support/shifts-fixtures.js";
import { randomUUID } from "node:crypto";

async function openShiftAt(
  cashier: Awaited<ReturnType<typeof createCashier>>,
  hoursOpen: number,
) {
  const opened = await request(app())
    .post("/api/shifts/open")
    .set(cashier.authorization)
    .send({ openingFloat: 500 });
  const openedAt = new Date(Date.now() - hoursOpen * 3_600_000);
  await db
    .update(shifts)
    .set({ openedAt })
    .where(eq(shifts.id, opened.body.id));
  await db
    .update(shiftEvents)
    .set({ occurredAt: openedAt })
    .where(eq(shiftEvents.shiftId, opened.body.id));
  return { id: opened.body.id as string, openedAt };
}

function service() {
  return new ShiftsService(new ShiftsRepository(db));
}

describe("shift auto-close", () => {
  it("gives a reopened shift a full new 16-hour segment", async () => {
    const cashier = await createCashier("auto-close-reopened");
    const { id } = await openShiftAt(cashier, 17);
    await service().autoCloseExpired();
    const reopened = await request(app())
      .post(`/api/shifts/${id}/reopen`)
      .set(cashier.adminAuthorization)
      .send({ note: "استكمال العمل" })
      .expect(200);
    const segmentStart = new Date(
      reopened.body.events.find(
        (event: { action: string }) => event.action === "reopen",
      ).occurredAt,
    );

    expect(
      await service().autoCloseExpired(
        new Date(segmentStart.getTime() + 15 * 3_600_000),
      ),
    ).toBe(0);
    const current = await request(app())
      .get("/api/shifts/current")
      .set(cashier.authorization)
      .expect(200);
    expect(current.body).toMatchObject({
      id,
      status: "open",
      currentSegmentMinutes: 0,
    });

    expect(
      await service().autoCloseExpired(
        new Date(segmentStart.getTime() + 17 * 3_600_000),
      ),
    ).toBe(1);
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    expect(row.closedAt!.getTime()).toBe(
      segmentStart.getTime() + 16 * 3_600_000,
    );
  });

  it("closes a shift that has been open for 16 hours with expected cash only", async () => {
    const cashier = await createCashier("auto-close-cashier");
    const { id, openedAt } = await openShiftAt(cashier, 16.5);

    const closedCount = await service().autoCloseExpired();

    expect(closedCount).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    expect(row.status).toBe("closed");
    expect(row.openSlot).toBeNull();
    expect(row.closedByUserId).toBeNull();
    expect(row.actualCash).toBeNull();
    expect(row.overShort).toBeNull();
    expect(row.expectedCash).toBe("500.00");
    // worked time is capped at 16h, not measured from "now"
    expect(
      Math.round(
        ((row.closedAt as Date).getTime() - openedAt.getTime()) / 1000,
      ),
    ).toBe(MAX_SHIFT_HOURS * 3600);
  });

  it("records an auto_close event with no actor", async () => {
    const cashier = await createCashier("auto-close-event-cashier");
    const { id } = await openShiftAt(cashier, 20);

    await service().autoCloseExpired();

    const events = await db
      .select()
      .from(shiftEvents)
      .where(eq(shiftEvents.shiftId, id));
    const autoClose = events.find((event) => event.action === "auto_close");
    expect(autoClose).toBeDefined();
    expect(autoClose!.actorUserId).toBeNull();
    expect(autoClose!.note).toBeTruthy();
  });

  it("leaves a shift that is still inside the 16 hour window open", async () => {
    const cashier = await createCashier("auto-close-fresh-cashier");
    const { id } = await openShiftAt(cashier, 15.9);

    await service().autoCloseExpired();

    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    expect(row.status).toBe("open");
  });

  it("closes only expired shifts in the branch", async () => {
    const expiredCashier = await createCashier("auto-close-expired-cashier");
    // a second cashier: one open shift per cashier is the rule, so the fresh
    // shift needs its own
    const freshCashier = await createCashier(
      "auto-close-fresh-cashier",
      undefined,
      expiredCashier.adminAuthorization,
    );
    const expired = await openShiftAt(expiredCashier, 17);
    const fresh = await openShiftAt(freshCashier, 1);

    await service().autoCloseExpired();

    const [expiredRow] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, expired.id));
    const [freshRow] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, fresh.id));
    expect(expiredRow.status).toBe("closed");
    expect(freshRow.status).toBe("open");
  });
});

describe("lazy auto-close on a cashier request", () => {
  it("closes the expired shift and reports that no shift is open", async () => {
    const cashier = await createCashier("lazy-auto-close-cashier");
    const { id } = await openShiftAt(cashier, 17);

    const current = await request(app())
      .get("/api/shifts/current")
      .set(cashier.authorization);

    expect(current.status).toBe(200);
    expect(current.body).toBeNull();
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    expect(row.status).toBe("closed");
    expect(row.actualCash).toBeNull();
  });

  it("lets the cashier open a new shift immediately after the auto-close", async () => {
    const cashier = await createCashier("lazy-auto-close-reopen-cashier");
    await openShiftAt(cashier, 17);

    const reopened = await request(app())
      .post("/api/shifts/open")
      .set(cashier.authorization)
      .send({ openingFloat: 250 });
    expect(reopened.status).toBe(201);
  });

  it("refuses a sale on the expired shift until a new one is opened", async () => {
    const cashier = await createCashier("lazy-auto-close-sale-cashier");
    const { id } = await openShiftAt(cashier, 17);

    // any well-formed order proves the point: the shift check rejects it with
    // 409 before stock or price matters
    const blocked = await request(app())
      .post("/api/orders")
      .set(cashier.authorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "item", itemId: testId(1), quantity: 1 }],
        discount: null,
        cashReceived: 100,
      });
    expect(blocked.status).toBe(409);
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    expect(row.status).toBe("closed");
  });
});

describe("shift auto-close across branches", () => {
  it("closes expired shifts in every active branch and leaves fresh ones open", async () => {
    const first = await createCashier("worker-branch-first");
    // createCashier already logged in as admin; a second login would collide
    const admin = first.adminAuthorization;
    const branch = await request(app())
      .post("/api/branches")
      .set(admin)
      .send({ name: `Auto Close Branch ${randomUUID().slice(0, 8)}` })
      .expect(201);
    const second = await createCashier(
      "worker-branch-second",
      "Second",
      admin,
      branch.body.id,
    );

    const freshBranch = await request(app())
      .post("/api/branches")
      .set(admin)
      .send({ name: "Fresh shift branch" })
      .expect(201);
    const fresh = await createCashier(
      "worker-branch-fresh",
      "Fresh",
      admin,
      freshBranch.body.id,
    );
    const freshShift = await openShiftAt(fresh, 1);
    const firstExpired = await openShiftAt(first, 17);
    const secondExpired = await openShiftAt(second, 18);

    const closed = await autoCloseExpiredBranches(db, createAutoCloseForDb(db));

    expect(closed).toBeGreaterThanOrEqual(2);
    for (const expired of [firstExpired, secondExpired]) {
      const [row] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.id, expired.id));
      expect(row.status).toBe("closed");
    }
    const [remaining] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, freshShift.id));
    expect(remaining.status).toBe("open");
  });

  it("visits every branch and keeps going when one of them fails", async () => {
    const visited: string[] = [];
    const failed: string[] = [];
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () =>
              Promise.resolve([{ id: testId(1) }, { id: testId(2) }]),
          }),
        }),
      }),
    };

    const closed = await autoCloseExpiredBranches(
      fakeDb as never,
      async (branchId) => {
        visited.push(branchId);
        if (branchId === testId(1)) throw new Error("first branch is broken");
        return 1;
      },
      undefined,
      (branchId) => failed.push(branchId),
    );

    expect(visited).toEqual([testId(1), testId(2)]);
    expect(failed).toEqual([testId(1)]);
    expect(closed).toBe(1);
  });
});

describe("correcting an auto-closed shift", () => {
  it("records the counted cash and the resulting over/short", async () => {
    const cashier = await createCashier("auto-close-correct-cashier");
    const { id } = await openShiftAt(cashier, 17);
    await service().autoCloseExpired();

    // the drawer was never counted: 500 opening float, 900 counted
    const corrected = await request(app())
      .put(`/api/shifts/${id}/correction`)
      .set(cashier.adminAuthorization)
      .send({ actualCash: 900, note: "عدّ متأخر" });

    expect(corrected.status).toBe(200);
    expect(corrected.body.actualCash).toBe("900.00");
    expect(corrected.body.expectedCash).toBe("500.00");
    expect(corrected.body.overShort).toBe("400.00");
    expect(corrected.body.status).toBe("closed");
  });

  it("keeps the auto_close event and adds a correction event", async () => {
    const cashier = await createCashier("auto-close-correct-event-cashier");
    const { id } = await openShiftAt(cashier, 17);
    await service().autoCloseExpired();

    await request(app())
      .put(`/api/shifts/${id}/correction`)
      .set(cashier.adminAuthorization)
      .send({ actualCash: 900, note: "عدّ متأخر" });

    const events = await db
      .select()
      .from(shiftEvents)
      .where(eq(shiftEvents.shiftId, id));
    expect(events.some((event) => event.action === "auto_close")).toBe(true);
    const correction = events.find((event) => event.action === "correction");
    expect(correction?.actualCash).toBe("900.00");
    expect(correction?.overShort).toBe("400.00");
  });
});
