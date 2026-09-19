import { describe, expect, it, vi } from "vitest";
import type { EmployeesRepository } from "../../src/modules/employees/employees.repository.js";
import { EmployeesService } from "../../src/modules/employees/employees.service.js";

function txRepo(overrides: Record<string, unknown> = {}) {
  return {
    findByIdForUpdate: vi.fn(async () => ({ id: 1, name: "أحمد", isActive: true })),
    findCashierAccessForUpdate: vi.fn(async () => undefined),
    hasOpenShift: vi.fn(async () => false),
    createCashierAccess: vi.fn(async () => 11),
    restoreCashierAccess: vi.fn(async () => undefined),
    revokeCashierAccess: vi.fn(async () => undefined),
    deactivate: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    syncCashierName: vi.fn(async () => undefined),
    ...overrides,
  };
}

function serviceWith(tx: Record<string, unknown>) {
  const repository = {
    transaction: vi.fn(async (run) => run(tx)),
    list: vi.fn(async () => []),
    create: vi.fn(async () => 1),
  } as unknown as EmployeesRepository;
  return { service: new EmployeesService(repository), repository };
}

describe("EmployeesService.grantCashierAccess", () => {
  it("404s a missing employee and 409s an inactive one", async () => {
    const missing = serviceWith(
      txRepo({ findByIdForUpdate: vi.fn(async () => undefined) }),
    );
    await expect(
      missing.service.grantCashierAccess(999, {
        username: "c1",
        password: "secret-123",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = serviceWith(
      txRepo({
        findByIdForUpdate: vi.fn(async () => ({
          id: 1,
          name: "أحمد",
          isActive: false,
        })),
      }),
    );
    await expect(
      inactive.service.grantCashierAccess(1, {
        username: "c1",
        password: "secret-123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s when active access already exists", async () => {
    const { service } = serviceWith(
      txRepo({
        findCashierAccessForUpdate: vi.fn(async () => ({
          id: 11,
          isActive: true,
        })),
      }),
    );

    await expect(
      service.grantCashierAccess(1, { username: "c1", password: "secret-123" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("restores dormant access instead of creating a duplicate", async () => {
    const tx = txRepo({
      findCashierAccessForUpdate: vi.fn(async () => ({
        id: 11,
        isActive: false,
      })),
    });
    const { service } = serviceWith(tx);

    await expect(
      service.grantCashierAccess(1, { username: "c1", password: "secret-123" }),
    ).resolves.toEqual({ userId: 11, created: false });
    expect(tx.restoreCashierAccess).toHaveBeenCalledTimes(1);
    expect(tx.createCashierAccess).not.toHaveBeenCalled();
  });

  it("creates fresh access and maps duplicate usernames to 409", async () => {
    const tx = txRepo();
    const { service } = serviceWith(tx);

    await expect(
      service.grantCashierAccess(1, { username: "c1", password: "secret-123" }),
    ).resolves.toEqual({ userId: 11, created: true });

    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const racing = serviceWith(
      txRepo({
        createCashierAccess: vi.fn(async () => {
          throw duplicate;
        }),
      }),
    );
    await expect(
      racing.service.grantCashierAccess(1, {
        username: "taken",
        password: "secret-123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("EmployeesService.revokeCashierAccess", () => {
  it("404s missing employees and missing access", async () => {
    const missingEmployee = serviceWith(
      txRepo({ findByIdForUpdate: vi.fn(async () => undefined) }),
    );
    await expect(
      missingEmployee.service.revokeCashierAccess(999),
    ).rejects.toMatchObject({ status: 404 });

    const missingAccess = serviceWith(txRepo());
    await expect(
      missingAccess.service.revokeCashierAccess(1),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("treats already-revoked access as successful", async () => {
    const tx = txRepo({
      findCashierAccessForUpdate: vi.fn(async () => ({
        id: 11,
        isActive: false,
      })),
    });
    const { service } = serviceWith(tx);

    await expect(service.revokeCashierAccess(1)).resolves.toBeUndefined();
    expect(tx.revokeCashierAccess).not.toHaveBeenCalled();
  });

  it("409s revocation during an open shift", async () => {
    const { service } = serviceWith(
      txRepo({
        findCashierAccessForUpdate: vi.fn(async () => ({
          id: 11,
          isActive: true,
        })),
        hasOpenShift: vi.fn(async () => true),
      }),
    );

    await expect(service.revokeCashierAccess(1)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("EmployeesService.deactivate", () => {
  it("404s a missing employee and skips an inactive one", async () => {
    const missing = serviceWith(
      txRepo({ findByIdForUpdate: vi.fn(async () => undefined) }),
    );
    await expect(missing.service.deactivate(999)).rejects.toMatchObject({
      status: 404,
    });

    const tx = txRepo({
      findByIdForUpdate: vi.fn(async () => ({
        id: 1,
        name: "أحمد",
        isActive: false,
      })),
    });
    const { service } = serviceWith(tx);
    await expect(service.deactivate(1)).resolves.toBeUndefined();
    expect(tx.deactivate).not.toHaveBeenCalled();
  });

  it("409s deactivation during an open shift", async () => {
    const { service } = serviceWith(
      txRepo({ hasOpenShift: vi.fn(async () => true) }),
    );

    await expect(service.deactivate(1)).rejects.toMatchObject({ status: 409 });
  });
});

describe("EmployeesService update and list", () => {
  it("404s a missing employee and syncs renames to the cashier login", async () => {
    const missing = serviceWith(
      txRepo({ findByIdForUpdate: vi.fn(async () => undefined) }),
    );
    await expect(
      missing.service.update(999, { name: "x" }),
    ).rejects.toMatchObject({ status: 404 });

    const tx = txRepo();
    const { service } = serviceWith(tx);
    await service.update(1, { name: "محمد" });
    expect(tx.syncCashierName).toHaveBeenCalledWith(1, "محمد");

    const sameName = txRepo();
    await serviceWith(sameName).service.update(1, { name: "أحمد" });
    expect(sameName.syncCashierName).not.toHaveBeenCalled();
  });

  it("shapes cashier access as null or an object", async () => {
    const repository = {
      list: vi.fn(async () => [
        {
          id: 1,
          name: "أحمد",
          cashierUserId: null,
          cashierUsername: null,
          cashierIsActive: null,
        },
        {
          id: 2,
          name: "محمد",
          cashierUserId: 11,
          cashierUsername: "c1",
          cashierIsActive: true,
        },
      ]),
    } as unknown as EmployeesRepository;

    await expect(new EmployeesService(repository).list()).resolves.toEqual([
      expect.objectContaining({ id: 1, cashierAccess: null }),
      expect.objectContaining({
        id: 2,
        cashierAccess: { userId: 11, username: "c1", isActive: true },
      }),
    ]);
  });
});
