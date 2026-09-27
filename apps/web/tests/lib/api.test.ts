import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildHeaders } from "../../src/lib/api";
import { SESSION_KEY } from "../../src/lib/auth";

afterEach(() => vi.unstubAllGlobals());

describe("buildHeaders", () => {
  it.each(["branch", "account"])(
    "rejects a response after the %s changes",
    async (change) => {
      let userId = 11,
        branchId = 7;
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) =>
            key === SESSION_KEY
              ? JSON.stringify({
                  user: { id: userId, name: "Admin", role: "admin" },
                  exp: Math.floor(Date.now() / 1000) + 60,
                })
              : String(branchId),
          removeItem: vi.fn(),
        },
      });
      let complete!: (response: {
        ok: boolean;
        json(): Promise<object[]>;
      }) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        ),
      );
      const pending = api("/api/orders");
      if (change === "branch") branchId = 8;
      else userId = 12;
      complete({ ok: true, json: async () => [{ id: 99 }] });
      await expect(pending).rejects.toThrow("تم تغيير الحساب أو الفرع");
    },
  );
  it.each([
    { role: "admin", branchId: null, expected: "7" },
    { role: "cashier", branchId: 3, expected: "3" },
  ])(
    "sends the correct workspace for a $role",
    async ({ role, branchId, expected }) => {
      const stored = {
        user: { id: 11, name: "Workspace user", role, branchId },
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) =>
            key === SESSION_KEY ? JSON.stringify(stored) : "7",
          removeItem: vi.fn(),
        },
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => [] });
      vi.stubGlobal("fetch", fetchMock);
      await api("/api/orders");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(new Headers(init.headers).get("X-Branch-Id")).toBe(expected);
    },
  );

  it("keeps login and branch discovery independent of the selected workspace", async () => {
    const stored = {
      user: { id: 11, name: "Admin", role: "admin", branchId: null },
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === SESSION_KEY ? JSON.stringify(stored) : "7",
        removeItem: vi.fn(),
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await api("/api/auth/login");
    await api("/api/branches");
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(new Headers(init.headers).get("X-Branch-Id")).toBeNull();
    }
  });
  it("preserves Headers input and caller precedence", () => {
    const headers = buildHeaders(
      new Headers({
        "Content-Type": "text/plain",
        Authorization: "Custom token",
      }),
      "session-token",
    );

    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("Authorization")).toBe("Custom token");
  });

  it("preserves tuple-array headers while adding authorization only", () => {
    const headers = buildHeaders(
      [["X-Request-Id", "123"]],
      "session-token",
      false,
    );

    expect(headers.get("X-Request-Id")).toBe("123");
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });

  it("adds JSON content type when a request has a body", () => {
    expect(buildHeaders(undefined, undefined, true).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("maps network failures to an Arabic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(api("/api/health")).rejects.toThrow("تعذر الاتصال بالخادم");
  });

  it("sends the HttpOnly cookie instead of a stored bearer token", async () => {
    const stored = {
      user: { id: 1, name: "Admin", role: "admin" },
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => JSON.stringify(stored)),
        removeItem: vi.fn(),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/health");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });
});
