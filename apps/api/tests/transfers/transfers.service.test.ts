import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import { requestFingerprint as hashRequest } from "../../src/lib/request-fingerprint.js";
import type { TransfersRepository } from "../../src/modules/transfers/transfers.repository.js";
import { TransfersService } from "../../src/modules/transfers/transfers.service.js";

const admin = { id: 7, role: "admin" } as AuthUser;
const cashier = { id: 9, role: "cashier" } as AuthUser;

const requestInput = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  notes: "احتياج الوردية",
  lines: [{ itemId: 5, quantity: 1 }],
};

const fingerprintOf = (data: typeof requestInput) =>
  hashRequest({
    notes: data.notes ?? null,
    lines: [...data.lines].sort((a, b) => a.itemId - b.itemId),
  });

function repoForRequest(
  transactionRepo: Record<string, unknown>,
  outer: Record<string, unknown> = {},
) {
  const repo = {
    transaction: vi.fn(async (run) =>
      run(transactionRepo, { consume: vi.fn(), receive: vi.fn() }),
    ),
    findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
    ...outer,
  } as unknown as TransfersRepository;
  return repo;
}

describe("TransfersService.createRequest item guards", () => {
  it("404s when a requested item does not exist", async () => {
    const repo = repoForRequest({
      findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
      lockItems: vi.fn().mockResolvedValue([]),
    });

    const failure = await new TransfersService(repo)
      .createRequest(requestInput, admin)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 404 });
  });

  it("409s with the item name when a requested item is inactive", async () => {
    const repo = repoForRequest({
      findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
      lockItems: vi
        .fn()
        .mockResolvedValue([{ id: 5, name: "بن", isActive: false }]),
    });

    const failure = await new TransfersService(repo)
      .createRequest(requestInput, admin)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
    expect(String((failure as Error).message)).toContain("بن");
  });

  it("409s when a cashier has no open shift", async () => {
    const repo = repoForRequest({
      findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findOpenShiftForCashier: vi.fn().mockResolvedValue(undefined),
      lockItems: vi
        .fn()
        .mockResolvedValue([{ id: 5, name: "بن", isActive: true }]),
    });

    const failure = await new TransfersService(repo)
      .createRequest(requestInput, cashier)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
  });
});

describe("TransfersService.createRequest idempotency", () => {
  it("replays the same request without creating a duplicate", async () => {
    const transactionRepo = {
      findRequestByClientRequestId: vi.fn().mockResolvedValue({
        id: 12,
        requestedBy: admin.id,
        requestFingerprint: fingerprintOf(requestInput),
      }),
      createRequest: vi.fn(),
    };
    const repo = repoForRequest(transactionRepo);

    const id = await new TransfersService(repo).createRequest(
      requestInput,
      admin,
    );

    expect(id).toBe(12);
    expect(transactionRepo.createRequest).not.toHaveBeenCalled();
  });

  it("409s when the same key is replayed with different lines", async () => {
    const transactionRepo = {
      findRequestByClientRequestId: vi.fn().mockResolvedValue({
        id: 12,
        requestedBy: admin.id,
        requestFingerprint: "different",
      }),
    };
    const repo = repoForRequest(transactionRepo);

    const failure = await new TransfersService(repo)
      .createRequest(requestInput, admin)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
  });

  it("409s when the same key is replayed by another user", async () => {
    const transactionRepo = {
      findRequestByClientRequestId: vi.fn().mockResolvedValue({
        id: 12,
        requestedBy: 555,
        requestFingerprint: fingerprintOf(requestInput),
      }),
    };
    const repo = repoForRequest(transactionRepo);

    const failure = await new TransfersService(repo)
      .createRequest(requestInput, admin)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
  });

  it("maps a losing insert race to the replayed request id", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const transactionRepo = {
      findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
      lockItems: vi
        .fn()
        .mockResolvedValue([{ id: 5, name: "بن", isActive: true }]),
      createRequest: vi.fn().mockRejectedValue(duplicate),
    };
    const repo = repoForRequest(transactionRepo, {
      findRequestByClientRequestId: vi.fn().mockResolvedValue({
        id: 77,
        requestedBy: admin.id,
        requestFingerprint: fingerprintOf(requestInput),
      }),
    });

    const id = await new TransfersService(repo).createRequest(
      requestInput,
      admin,
    );

    expect(id).toBe(77);
  });
});

describe("TransfersService.approveRequest guards", () => {
  function approveRepo(
    request: { id: number; status: string; requestedBy: number } | undefined,
    requestedLines: Array<{ itemId: number }>,
  ) {
    const transactionRepo = {
      lockRequest: vi.fn().mockResolvedValue(request),
      listRequestLines: vi.fn().mockResolvedValue(requestedLines),
      lockItems: vi.fn().mockResolvedValue(
        requestedLines.map((line) => ({
          id: line.itemId,
          name: "بن",
          isActive: true,
        })),
      ),
    };
    return repoForRequest(transactionRepo);
  }

  it("404s when the request does not exist", async () => {
    const failure = await new TransfersService(approveRepo(undefined, []))
      .approveRequest(999, { lines: [{ itemId: 5, quantity: 1 }] }, admin.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 404 });
  });

  it("409s when the request was already reviewed", async () => {
    const repo = approveRepo({ id: 1, status: "approved", requestedBy: 7 }, [
      { itemId: 5 },
    ]);

    const failure = await new TransfersService(repo)
      .approveRequest(1, { lines: [{ itemId: 5, quantity: 1 }] }, admin.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 409 });
  });

  it("400s when approval adds an item that was not requested", async () => {
    const repo = approveRepo({ id: 1, status: "pending", requestedBy: 7 }, [
      { itemId: 5 },
    ]);

    const failure = await new TransfersService(repo)
      .approveRequest(
        1,
        {
          lines: [
            { itemId: 5, quantity: 1 },
            { itemId: 6, quantity: 1 },
          ],
        },
        admin.id,
      )
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 400 });
  });

  it("400s when approval omits a requested item", async () => {
    const repo = approveRepo({ id: 1, status: "pending", requestedBy: 7 }, [
      { itemId: 5 },
      { itemId: 6 },
    ]);

    const failure = await new TransfersService(repo)
      .approveRequest(1, { lines: [{ itemId: 5, quantity: 1 }] }, admin.id)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 400 });
  });
});

describe("TransfersService lookups", () => {
  it("404s when a request or transfer does not exist", async () => {
    const repo = {
      findRequestById: vi.fn().mockResolvedValue(undefined),
      findTransferById: vi.fn().mockResolvedValue(undefined),
    } as unknown as TransfersRepository;
    const service = new TransfersService(repo);

    await expect(service.getRequest(999)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getTransfer(999)).rejects.toMatchObject({
      status: 404,
    });
  });
});
