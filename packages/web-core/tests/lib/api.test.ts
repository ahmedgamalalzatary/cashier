import { testId } from "@cashier/shared/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildHeaders } from "../../src/lib/api";
import { readSession, SESSION_KEY, writeSession } from "../../src/lib/auth";

afterEach(() => vi.unstubAllGlobals());

describe("buildHeaders", () => {
  it("clears a session when the PC no longer allows its account", async () => {
    const storage = new Map([
      [
        SESSION_KEY,
        JSON.stringify({
          user: { id: testId(701), name: "Removed admin", role: "admin" },
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      ],
    ]);
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => storage.delete(key),
        },
      }),
    );
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: "Branch access removed" }), {
          status: 403,
        }),
    );
    await expect(api("/api/auth/me")).rejects.toThrow("Branch access removed");
    expect(readSession()).toBeNull();
  });
  it("uses the API port supplied by the desktop runtime instead of the web deployment URL", async () => {
    vi.stubGlobal("window", {
      __TAURI_INTERNALS__: {},
      __CASHIER_DESKTOP_API_URL__: "http://127.0.0.1:43210",
      localStorage: { getItem: () => null, removeItem: () => undefined },
    });
    vi.stubGlobal(
      "fetch",
      async (url: string) =>
        new Response(JSON.stringify({ requestedUrl: url })),
    );
    await expect(api("/api/auth/me")).resolves.toEqual({
      requestedUrl: "http://127.0.0.1:43210/api/auth/me",
    });
  });
  it.each(["http:", "https:", "tauri:"])(
    "authenticates a Tauri %s shell after login without cookies",
    async (protocol) => {
      const storage = new Map<string, string>();
      const user = {
        id: testId(1),
        name: "Admin",
        role: "admin" as const,
        isSuperAdmin: false,
      };
      const payload = Buffer.from(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 }),
      ).toString("base64url");
      const token = `header.${payload}.signature`;
      vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), {
          __TAURI_INTERNALS__: {},
          location: { protocol },
          localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
          },
        }),
      );
      // Model the API boundary: requests without the login token are rejected.
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const authenticated =
          new Headers(init.headers).get("Authorization") === `Bearer ${token}`;
        return new Response(
          JSON.stringify(authenticated ? user : { error: "Missing token" }),
          { status: authenticated ? 200 : 401 },
        );
      });

      writeSession({ token, user });

      await expect(api("/api/auth/me")).resolves.toEqual(user);
    },
  );
  it.each(["branch", "account"])(
    "rejects a response after the %s changes",
    async (change) => {
      let userId = testId(11),
        branchId = testId(7);
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
      if (change === "branch") branchId = testId(8);
      else userId = testId(12);
      complete({ ok: true, json: async () => [{ id: testId(99) }] });
      await expect(pending).rejects.toThrow("تم تغيير الحساب أو الفرع");
    },
  );
  it.each([
    { role: "admin", branchId: null, expected: testId(7) },
    { role: "cashier", branchId: testId(3), expected: testId(3) },
  ])(
    "sends the correct workspace for a $role",
    async ({ role, branchId, expected }) => {
      const stored = {
        user: { id: testId(11), name: "Workspace user", role, branchId },
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) =>
            key === SESSION_KEY ? JSON.stringify(stored) : testId(7),
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
      user: { id: testId(11), name: "Admin", role: "admin", branchId: null },
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === SESSION_KEY ? JSON.stringify(stored) : testId(7),
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
      user: { id: testId(1), name: "Admin", role: "admin" },
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
