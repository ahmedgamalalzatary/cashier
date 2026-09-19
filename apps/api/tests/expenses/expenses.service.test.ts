import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../src/middleware/error.js";
import type { ExpensesRepository } from "../../src/modules/expenses/expenses.repository.js";
import { ExpensesService } from "../../src/modules/expenses/expenses.service.js";

const actor = { id: 3, role: "admin" } as AuthUser;
const cashierActor = { id: 9, role: "cashier" } as AuthUser;

const cairoToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

describe("ExpensesService idempotency fingerprint", () => {
  it("replays the same expense when JSON field order differs", async () => {
    let stored:
      | { id: number; recordedBy: number; requestFingerprint: string }
      | undefined;
    const tx = {
      byRequestId: vi.fn(async () => stored),
      category: vi.fn().mockResolvedValue({ id: 1, isActive: true }),
      create: vi.fn(async (row: { requestFingerprint: string }) => {
        stored = {
          id: 9,
          recordedBy: actor.id,
          requestFingerprint: row.requestFingerprint,
        };
        return 9;
      }),
    };
    const repo = {
      transaction: vi.fn(async (run: (r: typeof tx) => Promise<number>) =>
        run(tx),
      ),
      byRequestId: vi.fn(async () => stored),
      get: vi.fn(async (id: number) => ({ id })),
    } as unknown as ExpensesRepository;
    const service = new ExpensesService(repo);

    const first = await service.create(
      {
        clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        categoryId: 1,
        amount: 12.5,
        expenseDate: "2026-07-20",
        note: "كهرباء",
      },
      actor,
    );
    const replay = await service.create(
      {
        note: "كهرباء",
        expenseDate: "2026-07-20",
        amount: 12.5,
        categoryId: 1,
        clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      actor,
    );

    expect(first).toEqual({ id: 9 });
    expect(replay).toEqual({ id: 9 });
    expect(tx.create).toHaveBeenCalledTimes(1);
  });

  it("still 409s when the payload actually changed", async () => {
    const repo = {
      transaction: vi.fn(async (run: (r: { byRequestId: () => Promise<unknown> }) => Promise<number>) =>
        run({
          byRequestId: async () => ({
            id: 9,
            recordedBy: actor.id,
            requestFingerprint: "other",
          }),
        }),
      ),
    } as unknown as ExpensesRepository;

    await expect(
      new ExpensesService(repo).create(
        {
          clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          categoryId: 1,
          amount: 12.5,
          expenseDate: "2026-07-20",
          note: "كهرباء",
        },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<HttpError>);
  });
});

function repoForCreate(
  txRepo: Record<string, unknown>,
  outer: Record<string, unknown> = {},
) {
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(txRepo),
    ),
    byRequestId: vi.fn(async () => undefined),
    get: vi.fn(async (id: number) => ({ id })),
    ...outer,
  } as unknown as ExpensesRepository;
}

const expenseInput = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  categoryId: 1,
  amount: 12.5,
  expenseDate: "2026-07-20",
  note: "كهرباء",
};

describe("ExpensesService categories", () => {
  it("maps a duplicate category name to 409 on create and rename", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const createRepo = {
      createCategory: vi.fn().mockRejectedValue(duplicate),
    } as unknown as ExpensesRepository;
    await expect(
      new ExpensesService(createRepo).createCategory("نظافة"),
    ).rejects.toMatchObject({ status: 409 });

    const updateRepo = {
      category: vi.fn(async () => ({ id: 1 })),
      updateCategory: vi.fn().mockRejectedValue(duplicate),
    } as unknown as ExpensesRepository;
    await expect(
      new ExpensesService(updateRepo).updateCategory(1, { name: "نظافة" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s when updating a missing category", async () => {
    const repo = {
      category: vi.fn(async () => undefined),
    } as unknown as ExpensesRepository;

    await expect(
      new ExpensesService(repo).updateCategory(999, { name: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("scopes category visibility and list ownership by role", async () => {
    const repo = {
      categories: vi.fn(async () => []),
      list: vi.fn(async () => []),
    } as unknown as ExpensesRepository;
    const service = new ExpensesService(repo);

    await service.categories(actor);
    await service.categories(cashierActor);
    await service.list(actor);
    await service.list(cashierActor);

    expect(repo.categories).toHaveBeenNthCalledWith(1, true);
    expect(repo.categories).toHaveBeenNthCalledWith(2, false);
    expect(repo.list).toHaveBeenNthCalledWith(1, undefined);
    expect(repo.list).toHaveBeenNthCalledWith(2, cashierActor.id);
  });
});

describe("ExpensesService.create guards", () => {
  it("404s a missing category and 409s an inactive one", async () => {
    const missing = repoForCreate({
      byRequestId: vi.fn(async () => undefined),
      category: vi.fn(async () => undefined),
    });
    await expect(
      new ExpensesService(missing).create(expenseInput, actor),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = repoForCreate({
      byRequestId: vi.fn(async () => undefined),
      category: vi.fn(async () => ({ id: 1, isActive: false })),
    });
    await expect(
      new ExpensesService(inactive).create(expenseInput, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s when a cashier has no open shift", async () => {
    const repo = repoForCreate({
      byRequestId: vi.fn(async () => undefined),
      category: vi.fn(async () => ({ id: 1, isActive: true })),
      openShiftForCashier: vi.fn(async () => undefined),
    });

    await expect(
      new ExpensesService(repo).create(expenseInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s when the same key was recorded by another user", async () => {
    const repo = repoForCreate({
      byRequestId: vi.fn(async () => ({
        id: 9,
        recordedBy: 555,
        requestFingerprint: "whatever",
      })),
    });

    await expect(
      new ExpensesService(repo).create(expenseInput, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps a losing insert race to the replayed expense", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const stored = { id: 9, categoryName: "نظافة" };
    const repo = repoForCreate(
      {
        byRequestId: vi.fn(async () => undefined),
        category: vi.fn(async () => ({ id: 1, isActive: true })),
        create: vi.fn().mockRejectedValue(duplicate),
      },
      {
        byRequestId: vi.fn(async () => ({
          id: 9,
          recordedBy: actor.id,
          requestFingerprint: (
            await import("../../src/lib/request-fingerprint.js")
          ).requestFingerprint({
            categoryId: expenseInput.categoryId,
            amount: expenseInput.amount,
            expenseDate: expenseInput.expenseDate,
            note: expenseInput.note,
          }),
        })),
        get: vi.fn(async () => stored),
      },
    );

    await expect(
      new ExpensesService(repo).create(expenseInput, actor),
    ).resolves.toEqual(stored);
  });
});

describe("ExpensesService.create date and type split", () => {
  it("ignores a cashier-supplied date and links the open shift", async () => {
    let stored: Record<string, unknown> = {};
    const repo = repoForCreate({
      byRequestId: vi.fn(async () => undefined),
      category: vi.fn(async () => ({ id: 1, isActive: true })),
      openShiftForCashier: vi.fn(async () => ({ id: 4 })),
      create: vi.fn(async (row: Record<string, unknown>) => {
        stored = row;
        return 9;
      }),
    });

    await new ExpensesService(repo).create(
      { ...expenseInput, expenseDate: "2000-01-01" },
      cashierActor,
    );

    expect(stored).toMatchObject({
      type: "shift",
      shiftId: 4,
      amount: "12.50",
      recordedBy: cashierActor.id,
    });
    expect(stored.expenseDate).toBe(cairoToday());
  });

  it("uses the admin-supplied date as a general expense", async () => {
    let stored: Record<string, unknown> = {};
    const repo = repoForCreate({
      byRequestId: vi.fn(async () => undefined),
      category: vi.fn(async () => ({ id: 1, isActive: true })),
      create: vi.fn(async (row: Record<string, unknown>) => {
        stored = row;
        return 9;
      }),
    });

    await new ExpensesService(repo).create(expenseInput, actor);

    expect(stored).toMatchObject({
      type: "general",
      shiftId: null,
      expenseDate: "2026-07-20",
    });
  });
});
