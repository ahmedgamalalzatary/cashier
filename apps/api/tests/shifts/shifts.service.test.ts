import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import type { ShiftsRepository } from "../../src/modules/shifts/shifts.repository.js";
import { ShiftsService } from "../../src/modules/shifts/shifts.service.js";

const cashier = { id: 9, role: "cashier" } as AuthUser;
const otherCashier = { id: 10, role: "cashier" } as AuthUser;

const zeroTotals = {
  ordersCount: 0,
  sales: "0.00",
  discounts: "0.00",
  transferRequests: 0,
  refunds: "0.00",
  expenses: "0.00",
  wasteEntries: 0,
};

function repoWithTx(txRepo: Record<string, unknown>) {
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(txRepo),
    ),
    findById: vi.fn(),
    totals: vi.fn(),
    events: vi.fn(),
  } as unknown as ShiftsRepository;
}

const openShiftRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  cashierUserId: cashier.id,
  status: "open",
  openingFloat: "100.00",
  actualCash: null,
  expectedCash: null,
  overShort: null,
  openedAt: new Date("2026-07-20T08:00:00Z"),
  closedAt: null,
  ...overrides,
});

describe("ShiftsService.open guards", () => {
  it("409s when the cashier is not linked to an active employee", async () => {
    for (const cashierRow of [
      undefined,
      { userIsActive: false, employeeId: 3, employeeIsActive: true },
      { userIsActive: true, employeeId: null, employeeIsActive: true },
      { userIsActive: true, employeeId: 3, employeeIsActive: false },
    ]) {
      const repo = repoWithTx({
        findCashierForUpdate: vi.fn().mockResolvedValue(cashierRow),
      });

      const failure = await new ShiftsService(repo)
        .open({ openingFloat: 100 }, cashier.id)
        .catch((error: unknown) => error);

      expect(failure).toMatchObject({ status: 409 });
    }
  });

  it("409s a second open as already-open instead of surfacing a 500", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const repo = repoWithTx({
      findCashierForUpdate: vi.fn().mockResolvedValue({
        userIsActive: true,
        employeeId: 3,
        employeeIsActive: true,
      }),
      create: vi.fn().mockRejectedValue(duplicate),
    });

    const failure = await new ShiftsService(repo)
      .open({ openingFloat: 100 }, cashier.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      status: 409,
      message: "توجد وردية مفتوحة بالفعل",
    });
  });
});

describe("ShiftsService.close guards", () => {
  it("404s when the shift does not exist", async () => {
    const repo = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const failure = await new ShiftsService(repo)
      .close(999, { actualCash: 100 }, cashier.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 404 });
  });

  it("409s when the shift is already closed", async () => {
    const repo = repoWithTx({
      findByIdForUpdate: vi
        .fn()
        .mockResolvedValue(openShiftRow({ status: "closed" })),
    });

    const failure = await new ShiftsService(repo)
      .close(1, { actualCash: 100 }, cashier.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
  });

  it("403s when closing another cashier's shift", async () => {
    const repo = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(openShiftRow()),
    });

    const failure = await new ShiftsService(repo)
      .close(1, { actualCash: 100 }, otherCashier.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 403 });
  });

  it("retries once after a deadlock then closes", async () => {
    const deadlock = Object.assign(new Error("deadlock"), {
      code: "ER_LOCK_DEADLOCK",
    });
    const txRepo = {
      findByIdForUpdate: vi.fn().mockResolvedValue(openShiftRow()),
      totals: vi.fn().mockResolvedValue(zeroTotals),
      close: vi.fn(),
      createEvent: vi.fn(),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(async (run) => run(txRepo)),
      findById: vi.fn().mockResolvedValue(openShiftRow()),
      totals: vi.fn().mockResolvedValue(zeroTotals),
      events: vi.fn().mockResolvedValue([]),
    } as unknown as ShiftsRepository;

    const closed = await new ShiftsService(repo).close(
      1,
      { actualCash: 100 },
      cashier.id,
    );

    expect(repo.transaction).toHaveBeenCalledTimes(2);
    expect(txRepo.close).toHaveBeenCalledTimes(1);
    expect(closed).toMatchObject({ id: 1 });
  });
});

describe("ShiftsService.adminClose guards", () => {
  it("404s a missing shift and 409s an already-closed one", async () => {
    const missing = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      new ShiftsService(missing).adminClose(
        999,
        { actualCash: 100, note: "إغلاق" },
        1,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const closed = repoWithTx({
      findByIdForUpdate: vi
        .fn()
        .mockResolvedValue(openShiftRow({ status: "closed" })),
    });
    await expect(
      new ShiftsService(closed).adminClose(
        1,
        { actualCash: 100, note: "إغلاق" },
        1,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("ShiftsService.reopen guards", () => {
  const note = { note: "إعادة فتح" };
  const activeCashier = {
    userIsActive: true,
    employeeId: 3,
    employeeIsActive: true,
  };

  it("404s a missing shift", async () => {
    const repo = repoWithTx({
      findById: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      new ShiftsService(repo).reopen(999, note, 1),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s when the cashier or employee is inactive", async () => {
    const repo = repoWithTx({
      findById: vi.fn().mockResolvedValue(openShiftRow()),
      findCashierForUpdate: vi
        .fn()
        .mockResolvedValue({ ...activeCashier, employeeIsActive: false }),
    });

    await expect(
      new ShiftsService(repo).reopen(1, note, 1),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s when the shift is still open", async () => {
    const repo = repoWithTx({
      findById: vi.fn().mockResolvedValue(openShiftRow()),
      findCashierForUpdate: vi.fn().mockResolvedValue(activeCashier),
      findByIdForUpdate: vi.fn().mockResolvedValue(openShiftRow()),
    });

    await expect(
      new ShiftsService(repo).reopen(1, note, 1),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("ShiftsService.correct guards", () => {
  const correction = { note: "تصحيح", actualCash: 120 };

  it("404s a missing shift", async () => {
    const repo = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      new ShiftsService(repo).correct(999, correction, 1),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s when the shift is still open or was never counted", async () => {
    const open = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(openShiftRow()),
    });
    await expect(
      new ShiftsService(open).correct(1, correction, 1),
    ).rejects.toMatchObject({ status: 409 });

    const uncounted = repoWithTx({
      findByIdForUpdate: vi.fn().mockResolvedValue(
        openShiftRow({ status: "closed", actualCash: null }),
      ),
    });
    await expect(
      new ShiftsService(uncounted).correct(1, correction, 1),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("ShiftsService visibility", () => {
  it("404s a missing shift on get", async () => {
    const repo = repoWithTx({});
    vi.mocked(repo.findById).mockResolvedValue(undefined);

    await expect(new ShiftsService(repo).get(999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("reports occupied to a different cashier and null when none open", async () => {
    const occupiedRepo = {
      findCurrent: vi
        .fn()
        .mockResolvedValue({ id: 1, cashierUserId: otherCashier.id }),
    } as unknown as ShiftsRepository;
    await expect(
      new ShiftsService(occupiedRepo).current(cashier),
    ).resolves.toEqual({ occupied: true });

    const emptyRepo = {
      findCurrent: vi.fn().mockResolvedValue(undefined),
    } as unknown as ShiftsRepository;
    await expect(
      new ShiftsService(emptyRepo).current(cashier),
    ).resolves.toBeNull();
  });
});
