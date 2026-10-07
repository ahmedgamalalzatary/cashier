import { testId } from "@cashier/shared/test-support";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";

describe("AuthService credential work", () => {
  it("compares unknown users against a production-cost dummy hash", async () => {
    const repo = {
      findByUsername: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const compare = vi.fn().mockResolvedValue(false);
    const service = new AuthService(
      repo,
      "test-only-jwt-secret-at-least-32-characters",
      compare,
    );

    await expect(
      service.login({ username: "missing", password: "guess" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(compare).toHaveBeenCalledOnce();
    expect(bcrypt.getRounds(compare.mock.calls[0][1])).toBe(10);
  });

  it("finishes password comparison before rejecting an inactive user", async () => {
    const storedHash = await bcrypt.hash("secret123", 4);
    const repo = {
      findByUsername: vi.fn().mockResolvedValue({
        id: testId(1),
        name: "Inactive",
        username: "inactive",
        passwordHash: storedHash,
        role: "cashier",
        isActive: false,
      }),
    } as unknown as AuthRepository;
    let resolveCompare: (matched: boolean) => void = () => undefined;
    const compare = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCompare = resolve;
        }),
    );
    const service = new AuthService(
      repo,
      "test-only-jwt-secret-at-least-32-characters",
      compare,
    );

    const pending = service.login({
      username: "inactive",
      password: "secret123",
    });
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(compare).toHaveBeenCalledWith("secret123", storedHash);
    expect(settled).toBe(false);

    resolveCompare(true);
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(settled).toBe(true);
  });
});

const JWT_SECRET = "test-only-jwt-secret-at-least-32-characters";

const activeUser = (overrides: Record<string, unknown> = {}) => ({
  id: testId(1),
  name: "Cashier",
  username: "cashier",
  passwordHash: "stored-hash",
  role: "cashier",
  isActive: true,
  branchId: testId(1),
  branchIsActive: true,
  isSuperAdmin: false,
  tokenVersion: 0,
  ...overrides,
});

describe("AuthService login outcomes", () => {



  it("returns a token and safe profile for valid credentials", async () => {
    const repo = {
      findByUsername: vi.fn().mockResolvedValue(activeUser()),
    } as unknown as AuthRepository;
    const service = new AuthService(
      repo,
      JWT_SECRET,
      vi.fn().mockResolvedValue(true),
    );

    const session = await service.login({
      username: "cashier",
      password: "secret123",
    });

    expect(session.user).toEqual({
      id: testId(1),
      name: "Cashier",
      role: "cashier",
      branchId: testId(1),
      isSuperAdmin: false,
    });
    expect(typeof session.token).toBe("string");
    expect(session).not.toHaveProperty("passwordHash");
  });

  it("uses one identical 401 for unknown users and wrong passwords", async () => {
    const unknownRepo = {
      findByUsername: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const wrongPasswordRepo = {
      findByUsername: vi.fn().mockResolvedValue(activeUser()),
    } as unknown as AuthRepository;

    const unknownFailure = await new AuthService(
      unknownRepo,
      JWT_SECRET,
      vi.fn().mockResolvedValue(false),
    )
      .login({ username: "missing", password: "guess" })
      .catch((error: unknown) => error);
    const wrongFailure = await new AuthService(
      wrongPasswordRepo,
      JWT_SECRET,
      vi.fn().mockResolvedValue(false),
    )
      .login({ username: "cashier", password: "guess" })
      .catch((error: unknown) => error);

    expect(unknownFailure).toMatchObject({ status: 401 });
    expect(wrongFailure).toMatchObject({
      status: 401,
      message: (unknownFailure as Error).message,
    });
  });
});
