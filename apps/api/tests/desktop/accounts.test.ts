import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestDeviceAccounts,
  runAccountsLoop,
  DeviceUnlinkedError,
} from "../../src/desktop/accounts.js";

const branchId = "019a1234-5678-7000-8000-000000000001";
const snapshot = {
  branch: {
    id: branchId,
    name: "Branch",
    isActive: true,
    createdAt: "2026-10-09T00:00:00.000Z",
  },
  users: [
    {
      id: "019a1234-5678-7000-8000-000000000002",
      name: "Owner",
      username: "owner",
      role: "admin",
      passwordHash: bcrypt.hashSync("secret123", 4),
      isSuperAdmin: true,
      isActive: true,
      tokenVersion: 0,
    },
  ],
  adminBranches: [],
};
const options = {
  apiUrl: "https://online.example/api",
  branchId,
  deviceToken: "a-device-token-over-32-characters",
  appVersion: "0.3.0",
};

afterEach(() => vi.useRealTimers());

describe("requesting device accounts", () => {
  it("authenticates as the device and validates its branch snapshot", async () => {
    let headers: Headers | undefined;
    let requested: string | undefined;
    const result = await requestDeviceAccounts({
      ...options,
      fetch: async (url, init) => {
        requested = String(url);
        headers = new Headers(init?.headers);
        return Response.json(snapshot);
      },
    });
    expect(requested).toBe("https://online.example/api/device/accounts");
    expect(headers?.get("Authorization")).toBe(
      "Device a-device-token-over-32-characters",
    );
    expect(headers?.get("X-Cashier-Version")).toBe("0.3.0");
    expect(result).toEqual(snapshot);
  });

  it.each([
    {
      ...snapshot,
      branch: {
        ...snapshot.branch,
        id: "019a1234-5678-7000-8000-000000000003",
      },
    },
    { ...snapshot, users: [] },
    { ...snapshot, users: [{ ...snapshot.users[0], role: "cashier" }] },
    { ...snapshot, users: [...snapshot.users, snapshot.users[0]] },
    {
      ...snapshot,
      users: [
        ...snapshot.users,
        {
          ...snapshot.users[0],
          id: "019a1234-5678-7000-8000-000000000003",
          isSuperAdmin: false,
        },
      ],
      adminBranches: [
        { adminUserId: "019a1234-5678-7000-8000-000000000003", branchId },
      ],
    },
    {
      ...snapshot,
      adminBranches: [
        {
          adminUserId: snapshot.users[0].id,
          branchId: "019a1234-5678-7000-8000-000000000003",
        },
      ],
    },
    {
      ...snapshot,
      users: [{ ...snapshot.users[0], passwordHash: "plaintext" }],
    },
  ])(
    "rejects an unusable or inconsistent snapshot before applying it",
    async (body) => {
      await expect(
        requestDeviceAccounts({
          ...options,
          fetch: async () => Response.json(body),
        }),
      ).rejects.toThrow("snapshot");
    },
  );

  it("distinguishes a revoked token without disclosing the token or server body", async () => {
    await expect(
      requestDeviceAccounts({
        ...options,
        fetch: async () =>
          Response.json({ error: options.deviceToken }, { status: 401 }),
      }),
    ).rejects.toBeInstanceOf(DeviceUnlinkedError);
    expect(new DeviceUnlinkedError().message).toContain(
      "Close and reopen Cashier to link it again.",
    );
  });

  it("bounds a stalled request and aborts it when the desktop closes", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    let aborted = false;
    const stalled: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("cancelled"));
          },
          { once: true },
        );
      });
    const timeout = requestDeviceAccounts({ ...options, fetch: stalled });
    const rejected = expect(timeout).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
    expect(aborted).toBe(true);
    aborted = false;
    const pending = requestDeviceAccounts({
      ...options,
      fetch: stalled,
      signal: shutdown.signal,
    });
    const closed = expect(pending).rejects.toThrow();
    shutdown.abort();
    await closed;
    expect(aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("accounts worker", () => {
  it("pulls on start and every fifteen minutes, then stops promptly on shutdown", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    let pulls = 0;
    const worker = runAccountsLoop(async () => {
      pulls++;
    }, shutdown.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(pulls).toBe(1);
    await vi.advanceTimersByTimeAsync(899_999);
    expect(pulls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pulls).toBe(2);
    shutdown.abort();
    await worker;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries an offline failure and never overlaps an unfinished pull", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    let pulls = 0;
    let finish: (() => void) | undefined;
    const errors: unknown[] = [];
    const worker = runAccountsLoop(
      async () => {
        pulls++;
        if (pulls === 1) throw new Error("offline");
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      shutdown.signal,
      (error) => {
        errors.push(error);
      },
    );
    await vi.advanceTimersByTimeAsync(900_000);
    expect(pulls).toBe(2);
    expect(errors).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(pulls).toBe(2);
    shutdown.abort();
    finish!();
    await worker;
  });

  it("stops retrying after online revokes this device", async () => {
    vi.useFakeTimers();
    let pulls = 0;
    const errors: unknown[] = [];
    await runAccountsLoop(
      async () => {
        pulls++;
        throw new DeviceUnlinkedError();
      },
      new AbortController().signal,
      (error) => {
        errors.push(error);
      },
    );
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(pulls).toBe(1);
    expect(errors).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
