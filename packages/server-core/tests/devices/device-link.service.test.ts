import { createHash } from "node:crypto";
import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { DeviceLinkRepository } from "../../src/modules/devices/device-link.repository.js";
import { DeviceLinkService } from "../../src/modules/devices/device-link.service.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const NOW = new Date("2026-10-09T10:00:00Z");
const branchId = testId(20);
const CODE = "ABCD2345";

type Code = {
  branchId: string;
  branchName: string;
  branchIsActive: boolean;
  expiresAt: Date;
  usedAt: Date | null;
};
const validCode: Code = {
  branchId,
  branchName: "فرع الشمال",
  branchIsActive: true,
  expiresAt: new Date(NOW.getTime() + 60_000),
  usedAt: null,
};

function repoWith(code: Code | undefined) {
  const tx = {
    findCodeForUpdate: vi.fn(async () => code),
    markCodeUsed: vi.fn(async () => undefined),
    replaceDevice: vi.fn(async () => undefined),
  };
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(tx),
    ),
    tx,
  } as unknown as DeviceLinkRepository & { tx: typeof tx };
}

const link = (
  repo: DeviceLinkRepository,
  code: string,
  version?: string,
  expectedBranchId?: string,
) => new DeviceLinkService(repo, () => NOW).link(code, version, expectedBranchId);

describe("DeviceLinkService.link", () => {
  it("links the PC to the code's branch and hands out a token once", async () => {
    const repo = repoWith(validCode);

    const result = await link(repo, CODE);

    expect(result.branch).toEqual({ id: branchId, name: "فرع الشمال" });
    // 32 random bytes as base64url
    expect(result.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repo.tx.findCodeForUpdate).toHaveBeenCalledWith(sha256(CODE));
    expect(repo.tx.markCodeUsed).toHaveBeenCalledWith(sha256(CODE), NOW);
    expect(repo.tx.replaceDevice).toHaveBeenCalledWith(
      branchId,
      sha256(result.deviceToken),
      NOW,
      undefined,
    );
  });

  it("stores the PC's version on the device it creates", async () => {
    const repo = repoWith(validCode);

    await link(repo, CODE, " 0.3.0 ");

    expect(repo.tx.replaceDevice).toHaveBeenCalledWith(
      branchId,
      expect.any(String),
      NOW,
      "0.3.0",
    );
  });

  it.each([
    ["no header", undefined],
    ["only whitespace", "   "],
  ])("links with %s and stores no version", async (_case, version) => {
    const repo = repoWith(validCode);

    await link(repo, CODE, version);

    expect(repo.tx.replaceDevice).toHaveBeenCalledWith(
      branchId,
      expect.any(String),
      NOW,
      undefined,
    );
  });

  it("bounds an over-long version so one PC cannot bloat the row", async () => {
    const repo = repoWith(validCode);

    await link(repo, CODE, "9".repeat(500));

    expect(repo.tx.replaceDevice).toHaveBeenCalledWith(
      branchId,
      expect.any(String),
      NOW,
      "9".repeat(64),
    );
  });

  it("never stores the token itself", async () => {
    const repo = repoWith(validCode);

    const result = await link(repo, CODE);

    expect(JSON.stringify(repo.tx.replaceDevice.mock.calls)).not.toContain(
      result.deviceToken,
    );
  });

  it("gives every link a different token", async () => {
    const first = await link(repoWith(validCode), CODE);
    const second = await link(repoWith(validCode), CODE);

    expect(first.deviceToken).not.toBe(second.deviceToken);
  });

  it("accepts the code typed in lower case, with spaces or a dash", async () => {
    const repo = repoWith(validCode);

    await link(repo, " abcd-2345 ");

    expect(repo.tx.findCodeForUpdate).toHaveBeenCalledWith(sha256(CODE));
  });

  it("refuses a malformed code without looking it up", async () => {
    const repo = repoWith(validCode);

    for (const code of ["", "ABC", "ABCD23450", "ABCD234O"])
      await expect(link(repo, code)).rejects.toMatchObject({ status: 400 });
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it("refuses a code made for another branch than the PC already holds, and spends nothing", async () => {
    const repo = repoWith(validCode);

    const failure = await link(repo, CODE, undefined, testId(21)).catch(
      (error: unknown) => error,
    );

    // the same message as any other refusal: the PC learns nothing from the code
    expect(failure).toMatchObject({
      status: 400,
      message: "كود الربط غير صحيح أو منتهي الصلاحية",
    });
    expect(repo.tx.markCodeUsed).not.toHaveBeenCalled();
    expect(repo.tx.replaceDevice).not.toHaveBeenCalled();
  });

  it("links when the PC already holds exactly the code's branch", async () => {
    const repo = repoWith(validCode);

    await expect(link(repo, CODE, undefined, branchId)).resolves.toMatchObject({
      branch: { id: branchId },
    });
    expect(repo.tx.markCodeUsed).toHaveBeenCalledWith(sha256(CODE), NOW);
    expect(repo.tx.replaceDevice).toHaveBeenCalled();
  });

  it.each([
    ["unknown", undefined],
    ["already used", { ...validCode, usedAt: new Date(NOW.getTime() - 1) }],
    ["expired", { ...validCode, expiresAt: NOW }],
    ["for an archived branch", { ...validCode, branchIsActive: false }],
  ])("refuses a code that is %s and links nothing", async (_case, code) => {
    const repo = repoWith(code);

    const failure = await link(repo, CODE).catch((error: unknown) => error);

    // one message for every case, so a guess reveals nothing about real codes
    expect(failure).toMatchObject({
      status: 400,
      message: "كود الربط غير صحيح أو منتهي الصلاحية",
    });
    expect(repo.tx.markCodeUsed).not.toHaveBeenCalled();
    expect(repo.tx.replaceDevice).not.toHaveBeenCalled();
  });
});
