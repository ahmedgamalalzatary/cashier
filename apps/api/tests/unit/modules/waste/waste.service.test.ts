import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import type { WasteRepository } from "../../../../src/modules/waste/waste.repository.js";
import { WasteService } from "../../../../src/modules/waste/waste.service.js";

const actor = { id: 4, role: "admin" } as AuthUser;

describe("WasteService idempotency fingerprint", () => {
  it("replays the same waste entry when JSON field order differs", async () => {
    let stored:
      | { id: number; recordedBy: number; requestFingerprint: string }
      | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findItem: vi.fn().mockResolvedValue({
        id: 2,
        name: "حليب",
        isActive: true,
      }),
      create: vi.fn(async (row: { requestFingerprint: string }) => {
        stored = {
          id: 8,
          recordedBy: actor.id,
          requestFingerprint: row.requestFingerprint,
        };
        return 8;
      }),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(
        async (run: (r: typeof tx, inv: object) => Promise<number>) =>
          run(tx, {
            consume: vi.fn().mockResolvedValue({
              allocations: [
                {
                  quantity: "1.000",
                  unitCost: "2.000000",
                  batchId: 1,
                  movementId: 1,
                },
              ],
            }),
          }),
      ),
      findByClientRequestId: vi.fn(async () => stored),
      find: vi.fn().mockResolvedValue({ id: 8, warehouse: "main" }),
      allocations: vi.fn().mockResolvedValue([]),
    } as unknown as WasteRepository;
    const service = new WasteService(repo);
    const clientRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await service.create(
      {
        clientRequestId,
        warehouse: "main",
        target: { type: "item", itemId: 2 },
        quantity: 1,
        reason: "spill",
        note: null,
      },
      actor,
    );
    const replay = await service.create(
      {
        note: null,
        reason: "spill",
        quantity: 1,
        target: { itemId: 2, type: "item" },
        warehouse: "main",
        clientRequestId,
      },
      actor,
    );

    expect(replay.id).toBe(8);
    expect(tx.create).toHaveBeenCalledTimes(1);
  });
});
