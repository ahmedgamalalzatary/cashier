import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";

const JWT_SECRET = "test-only-jwt-secret-at-least-32-characters";

const activeUser = (overrides: Record<string, unknown> = {}) => ({
  id: testId(1),
  name: "User",
  username: "user",
  passwordHash: "stored-hash",
  role: "cashier",
  isActive: true,
  branchId: testId(1),
  branchIsActive: true,
  isSuperAdmin: false,
  tokenVersion: 0,
  ...overrides,
});

function serviceFor(
  user: Record<string, unknown> | undefined,
  access: ConstructorParameters<typeof AuthService>[3],
) {
  const repo = {
    findByUsername: vi.fn().mockResolvedValue(user),
    isAdminAssigned: vi.fn().mockResolvedValue(false),
  } as unknown as AuthRepository;
  return new AuthService(repo, JWT_SECRET, async () => true, access);
}

const cashierLogin = {
  role: "cashier",
  username: "cashier",
  password: "secret123",
} as const;

describe("online login access", () => {
  it("refuses a cashier with valid credentials", async () => {
    const service = serviceFor(activeUser(), { online: true });

    await expect(service.login(cashierLogin)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("still issues a session to an admin online", async () => {
    const service = serviceFor(
      activeUser({ role: "admin", branchId: null, name: "Manager" }),
      { online: true },
    );

    const session = await service.login({
      role: "admin",
      username: "admin",
      password: "secret123",
    });

    expect(session.user).toEqual({
      id: testId(1),
      name: "Manager",
      role: "admin",
      branchId: null,
      isSuperAdmin: false,
    });
  });

  it("keeps accepting a cashier login without the online option", async () => {
    const service = serviceFor(activeUser(), undefined);

    const session = await service.login(cashierLogin);

    expect(session.user.role).toBe("cashier");
  });

  it("does not reveal that a cashier account exists before the password is checked", async () => {
    const repo = {
      findByUsername: vi.fn().mockResolvedValue(activeUser()),
    } as unknown as AuthRepository;
    const compare = vi.fn().mockResolvedValue(false);
    const service = new AuthService(repo, JWT_SECRET, compare, {
      online: true,
    });

    await expect(
      service.login({ ...cashierLogin, password: "wrong" }),
    ).rejects.toMatchObject({
      status: 401,
      message: "اسم المستخدم أو كلمة المرور غير صحيحة",
    });
    expect(compare).toHaveBeenCalledWith("wrong", "stored-hash");
  });
});