import { testId } from "@cashier/shared/test-support";
import type { AuthUser } from "@cashier/shared";
import { describe, expect, it, vi } from "vitest";
import type { LinkCodesRepository } from "../../src/modules/link-codes/link-codes.repository.js";
import { LinkCodesService } from "../../src/modules/link-codes/link-codes.service.js";

const superAdmin: AuthUser = {
  id: testId(7),
  name: "المدير الرئيسي",
  role: "admin",
  branchId: null,
  isSuperAdmin: true,
};
const regularAdmin: AuthUser = { ...superAdmin, isSuperAdmin: false };
const branchId = testId(20);
const archivedBranchId = testId(21);

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function repoForCode(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => undefined),
    existingBranchIds: vi.fn(async () => [branchId]),
    ...overrides,
  } as unknown as LinkCodesRepository;
}

describe("LinkCodesService.generate", () => {
  it("403s generating a code for an admin that is not the super-admin", async () => {
    const repo = repoForCode();

    await expect(
      new LinkCodesService(repo).generate(regularAdmin, { branchId }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("returns the plaintext code once and stores only its hash", async () => {
    const repo = repoForCode();

    const result = await new LinkCodesService(repo).generate(superAdmin, {
      branchId,
    });

    expect(result.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{8}$`));
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const [hash, expiresAt] = repo.insert.mock.calls[0] as unknown as [
      string,
      Date,
      string,
    ];
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(result.code);
    expect(expiresAt.getTime()).toBe(result.expiresAt.getTime());
  });

  it("expires a code 24 hours after it was generated", async () => {
    const repo = repoForCode();
    const before = Date.now();

    const result = await new LinkCodesService(repo).generate(superAdmin, {
      branchId,
    });

    const ttl = result.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(24 * 60 * 60 * 1000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("404s for a branch that does not exist", async () => {
    const repo = repoForCode();

    await expect(
      new LinkCodesService(repo).generate(superAdmin, {
        branchId: archivedBranchId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("never stores the code in a form that could be replayed from the database", async () => {
    const repo = repoForCode();

    const result = await new LinkCodesService(repo).generate(superAdmin, {
      branchId,
    });

    const stored = JSON.stringify(repo.insert.mock.calls[0]);
    expect(stored).not.toContain(result.code);
  });
});
