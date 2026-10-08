import { testId } from "@cashier/shared/test-support";
import type { AuthUser } from "@cashier/shared";
import { describe, expect, it, vi } from "vitest";
import type { AdminsRepository } from "../../src/modules/admins/admins.repository.js";
import { AdminsService } from "../../src/modules/admins/admins.service.js";

const superAdmin: AuthUser = {
  id: testId(7),
  name: "المدير الرئيسي",
  role: "admin",
  branchId: null,
  isSuperAdmin: true,
};
const regularAdmin: AuthUser = { ...superAdmin, isSuperAdmin: false };
const branchId = testId(20);
const otherBranchId = testId(21);
const accountId = testId(3);

// branchIds arrives already defaulted by the schema, as the router would.
const newAdmin = {
  name: "مدير جديد",
  username: "new-admin",
  password: "password-123",
  branchIds: [] as string[],
};

describe("AdminsService guards", () => {
  it("403s every write for an admin that is not the super-admin", async () => {
    const repo = {
      transaction: vi.fn(),
      list: vi.fn(),
      replaceBranches: vi.fn(),
    } as unknown as AdminsRepository;
    const service = new AdminsService(repo);

    await expect(service.create(regularAdmin, newAdmin)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.update(regularAdmin, accountId, { name: "x" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.assignBranches(regularAdmin, accountId, [branchId]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.list(regularAdmin)).rejects.toMatchObject({
      status: 403,
    });

    expect(repo.transaction).not.toHaveBeenCalled();
    expect(repo.replaceBranches).not.toHaveBeenCalled();
  });

  it("409s editing the super-admin's own account", async () => {
    const repo = { transaction: vi.fn() } as unknown as AdminsRepository;

    await expect(
      new AdminsService(repo).update(superAdmin, superAdmin.id, { name: "x" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.transaction).not.toHaveBeenCalled();
  });
});

function repoForUpdate(
  user: { id: string; role: string; isSuperAdmin?: boolean } | undefined,
  overrides: Record<string, unknown> = {},
) {
  const tx = {
    findByIdForUpdate: vi.fn(async () => user),
    update: vi.fn(async () => undefined),
    ...overrides,
  };
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(tx),
    ),
    tx,
  } as unknown as AdminsRepository & { tx: typeof tx };
}

describe("AdminsService update", () => {
  it("404s a missing account", async () => {
    await expect(
      new AdminsService(repoForUpdate(undefined)).update(
        superAdmin,
        testId(999),
        { name: "x" },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s a cashier account, which belongs to the branch records", async () => {
    await expect(
      new AdminsService(
        repoForUpdate({ id: testId(2), role: "cashier" }),
      ).update(superAdmin, testId(2), { name: "x" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s another flagged super-admin", async () => {
    await expect(
      new AdminsService(
        repoForUpdate({ id: testId(2), role: "admin", isSuperAdmin: true }),
      ).update(superAdmin, testId(2), { name: "x" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps a duplicate username to 409", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const repo = repoForUpdate(
      { id: testId(2), role: "admin" },
      {
        update: vi.fn(async () => {
          throw duplicate;
        }),
      },
    );

    await expect(
      new AdminsService(repo).update(superAdmin, testId(2), {
        username: "taken",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("stores a hash rather than the plain password", async () => {
    const repo = repoForUpdate({ id: testId(2), role: "admin" });

    await new AdminsService(repo).update(superAdmin, testId(2), {
      password: "replacement-789",
    });

    const changes = (
      repo.tx.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][1] as Record<string, unknown>;
    expect(changes).not.toHaveProperty("password");
    expect(typeof changes.passwordHash).toBe("string");
    expect(changes.passwordHash).not.toBe("replacement-789");
  });

  it("invalidates live sessions when an account is deactivated", async () => {
    const repo = repoForUpdate({ id: testId(2), role: "admin" });

    await new AdminsService(repo).update(superAdmin, testId(2), {
      isActive: false,
    });

    const changes = (
      repo.tx.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][1] as Record<string, unknown>;
    expect(changes.isActive).toBe(false);
  });

  it("saves details and branches together in one transaction", async () => {
    const repo = repoForUpdate(
      { id: testId(2), role: "admin" },
      {
        existingBranchIds: vi.fn(async () => [branchId]),
        replaceBranches: vi.fn(async () => undefined),
      },
    );

    await new AdminsService(repo).update(superAdmin, testId(2), {
      name: "اسم جديد",
      branchIds: [branchId],
    });

    expect(repo.transaction).toHaveBeenCalledTimes(1);
    expect(repo.tx.update).toHaveBeenCalledWith(testId(2), {
      name: "اسم جديد",
    });
    expect(
      (repo.tx as unknown as { replaceBranches: unknown }).replaceBranches,
    ).toHaveBeenCalledWith(testId(2), [branchId]);
  });

  it("changes only the branches when nothing else was edited", async () => {
    const repo = repoForUpdate(
      { id: testId(2), role: "admin" },
      {
        existingBranchIds: vi.fn(async () => [branchId]),
        replaceBranches: vi.fn(async () => undefined),
      },
    );

    await new AdminsService(repo).update(superAdmin, testId(2), {
      branchIds: [branchId],
    });

    expect(repo.tx.update).not.toHaveBeenCalled();
  });

  it("saves nothing when one of the branches is unknown", async () => {
    const repo = repoForUpdate(
      { id: testId(2), role: "admin" },
      {
        existingBranchIds: vi.fn(async () => [branchId]),
        replaceBranches: vi.fn(async () => undefined),
      },
    );

    await expect(
      new AdminsService(repo).update(superAdmin, testId(2), {
        name: "اسم جديد",
        branchIds: [otherBranchId],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.tx.update).not.toHaveBeenCalled();
  });
});

function repoForCreate(overrides: Record<string, unknown> = {}) {
  const tx = {
    create: vi.fn(async () => testId(4)),
    replaceBranches: vi.fn(async () => undefined),
    existingBranchIds: vi.fn(async () => [] as string[]),
    ...overrides,
  };
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(tx),
    ),
    tx,
  } as unknown as AdminsRepository & { tx: typeof tx };
}

describe("AdminsService create", () => {
  it("maps a duplicate username to 409", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const repo = repoForCreate({
      create: vi.fn(async () => {
        throw duplicate;
      }),
    });

    await expect(
      new AdminsService(repo).create(superAdmin, {
        ...newAdmin,
        username: "taken",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("never stores the plain password", async () => {
    const repo = repoForCreate();

    await new AdminsService(repo).create(superAdmin, newAdmin);

    const [, hash] = (
      repo.tx.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(hash).not.toBe(newAdmin.password);
    expect(typeof hash).toBe("string");
  });

  it("assigns the requested branches in the same transaction", async () => {
    const repo = repoForCreate({
      existingBranchIds: vi.fn(async () => [branchId]),
    });

    await new AdminsService(repo).create(superAdmin, {
      ...newAdmin,
      branchIds: [branchId],
    });

    expect(repo.tx.replaceBranches).toHaveBeenCalledWith(testId(4), [branchId]);
  });

  it("rejects an unknown branch and creates nothing", async () => {
    const repo = repoForCreate({
      existingBranchIds: vi.fn(async () => [branchId]),
    });

    await expect(
      new AdminsService(repo).create(superAdmin, {
        ...newAdmin,
        branchIds: [otherBranchId],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.tx.replaceBranches).not.toHaveBeenCalled();
  });
});

describe("AdminsService branch assignment", () => {
  function assignmentRepo(
    user: { id: string; role: string; isSuperAdmin?: boolean } | undefined,
    known: string[] = [branchId, otherBranchId],
  ) {
    const tx = {
      findByIdForUpdate: vi.fn(async () => user),
      existingBranchIds: vi.fn(async () => known),
      replaceBranches: vi.fn(async () => undefined),
    };
    return {
      transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
        run(tx),
      ),
      replaceBranches: tx.replaceBranches,
      tx,
    } as unknown as AdminsRepository & {
      replaceBranches: typeof tx.replaceBranches;
    };
  }

  it("rejects an unknown branch before writing anything", async () => {
    const repo = assignmentRepo({ id: accountId, role: "admin" }, [branchId]);

    await expect(
      new AdminsService(repo).assignBranches(superAdmin, accountId, [
        branchId,
        otherBranchId,
      ]),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.replaceBranches).not.toHaveBeenCalled();
  });

  it("404s an assignment for a missing account", async () => {
    const repo = assignmentRepo(undefined);

    await expect(
      new AdminsService(repo).assignBranches(superAdmin, accountId, [branchId]),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.replaceBranches).not.toHaveBeenCalled();
  });

  it("refuses to assign branches to the super-admin account", async () => {
    const repo = assignmentRepo({
      id: superAdmin.id,
      role: "admin",
      isSuperAdmin: true,
    });

    await expect(
      new AdminsService(repo).assignBranches(superAdmin, superAdmin.id, [
        branchId,
      ]),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.replaceBranches).not.toHaveBeenCalled();
  });

  it("accepts several branches for one account", async () => {
    const repo = assignmentRepo({ id: accountId, role: "admin" });

    await new AdminsService(repo).assignBranches(superAdmin, accountId, [
      branchId,
      otherBranchId,
    ]);

    expect(repo.replaceBranches).toHaveBeenCalledWith(accountId, [
      branchId,
      otherBranchId,
    ]);
  });

  it("clears every assignment when given none", async () => {
    const repo = assignmentRepo({ id: accountId, role: "admin" });

    await new AdminsService(repo).assignBranches(superAdmin, accountId, []);

    expect(repo.replaceBranches).toHaveBeenCalledWith(accountId, []);
  });
});
