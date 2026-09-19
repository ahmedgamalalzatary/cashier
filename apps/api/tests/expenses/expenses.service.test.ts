import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../src/middleware/error.js";
import type { ExpensesRepository } from "../../src/modules/expenses/expenses.repository.js";
import { ExpensesService } from "../../src/modules/expenses/expenses.service.js";

const actor = { id: 3, role: "admin" } as AuthUser;

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
