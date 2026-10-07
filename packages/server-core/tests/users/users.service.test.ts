import type { AuthUser } from "@cashier/shared";
import { describe, expect, it, vi } from "vitest";
import type { UsersRepository } from "../../src/modules/users/users.repository.js";
import { UsersService } from "../../src/modules/users/users.service.js";

const superAdmin: AuthUser = {
  id: 7,
  name: "المدير الرئيسي",
  role: "admin",
  branchId: null,
  isSuperAdmin: true,
};

const regularAdmin: AuthUser = { ...superAdmin, isSuperAdmin: false };

describe("UsersService admin-management guards", () => {
  it("403s create and update for a regular admin", async () => {
    const repo = {
      create: vi.fn(),
      transaction: vi.fn(),
    } as unknown as UsersRepository;
    const service = new UsersService(repo);

    await expect(
      service.create(regularAdmin, {
        name: "مدير",
        username: "new-admin",
        role: "admin",
        password: "password-123",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.update(regularAdmin, 3, { name: "x" }),
    ).rejects.toMatchObject({ status: 403 });

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it("409s any edit of the actor's own account without touching the repo", async () => {
    const repo = { transaction: vi.fn() } as unknown as UsersRepository;

    await expect(
      new UsersService(repo).update(superAdmin, 7, { name: "x" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "بيانات المدير الرئيسي تُدار من إعدادات الخادم",
    });
    expect(repo.transaction).not.toHaveBeenCalled();
  });
});

function repoForUpdate(
  user: { id: number; role: string; isSuperAdmin?: boolean } | undefined,
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
  } as unknown as UsersRepository & {
    tx: { update: { mock: { calls: unknown[][] } } };
  };
}

describe("UsersService update guards", () => {
  it("404s a missing user", async () => {
    const repo = repoForUpdate(undefined);

    await expect(
      new UsersService(repo).update(superAdmin, 999, { name: "x" }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("409s cashier-managed accounts in either direction", async () => {
    await expect(
      new UsersService(
        repoForUpdate({ id: 2, role: "cashier" }),
      ).update(superAdmin, 2, { name: "x" }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      new UsersService(
        repoForUpdate({ id: 2, role: "admin" }),
      ).update(superAdmin, 2, { role: "cashier" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s editing another flagged super-admin", async () => {
    await expect(
      new UsersService(
        repoForUpdate({ id: 2, role: "admin", isSuperAdmin: true }),
      ).update(superAdmin, 2, { name: "x" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps a duplicate username on update to 409", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const repo = repoForUpdate(
      { id: 2, role: "admin" },
      {
        update: vi.fn(async () => {
          throw duplicate;
        }),
      },
    );

    await expect(
      new UsersService(repo).update(superAdmin, 2, { username: "taken" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("stores a password hash instead of the plain password", async () => {
    const repo = repoForUpdate({ id: 2, role: "admin" });

    await new UsersService(repo).update(superAdmin, 2, {
      password: "replacement-789",
    });

    expect(repo.tx.update).toHaveBeenCalledTimes(1);
    const changes = (
      repo.tx.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][1] as Record<string, unknown>;
    expect(typeof changes.passwordHash).toBe("string");
    expect(changes.passwordHash).not.toBe("replacement-789");
    expect(changes).not.toHaveProperty("password");
  });
});

describe("UsersService create", () => {
  it("maps a duplicate username to 409", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const repo = {
      create: vi.fn(async () => {
        throw duplicate;
      }),
    } as unknown as UsersRepository;

    await expect(
      new UsersService(repo).create(superAdmin, {
        name: "مدير",
        username: "taken",
        role: "admin",
        password: "password-123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
