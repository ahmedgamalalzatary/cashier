import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { testId } from "@cashier/shared/test-support";

const userId = testId(1);
const branchId = testId(2);

/** A browser that kept a signed-in admin and the branch that admin selected. */
function browserSession() {
  const storage = new Map<string, string>([
    [
      "cashier.session",
      JSON.stringify({
        user: {
          id: userId,
          name: "Manager",
          role: "admin",
          branchId: null,
          isSuperAdmin: true,
        },
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ],
    [`cashier.branch.${userId}`, branchId],
  ]);
  return {
    location: { protocol: "https:", search: "" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

function jsonResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// web-core resolves the API host when it loads. This app must build with an
// empty base, so every call stays on the origin Nginx serves.
let builtApiUrl: string;

beforeAll(async () => {
  builtApiUrl = (await import("../next.config.js")).default.env!
    .NEXT_PUBLIC_API_URL as string;
});

describe("online API base", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("requests /api on the same origin with the browser cookie", async () => {
    process.env.NEXT_PUBLIC_API_URL = builtApiUrl;
    const fetchMock = vi.fn(async () => jsonResponse("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const { listBranches } = await import(
      "@cashier/web-core/services/branches-service"
    );

    await listBranches();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/branches",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("asks for the branch the admin selected, on the same origin", async () => {
    process.env.NEXT_PUBLIC_API_URL = builtApiUrl;
    const fetchMock =
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
        async () => jsonResponse("{}"),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", browserSession());
    const { getReports } = await import(
      "@cashier/web-core/services/reports-service"
    );

    await getReports("2026-09-01", "2026-09-30");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reports?from=2026-09-01&to=2026-09-30");
    expect(new Headers(init?.headers).get("X-Branch-Id")).toBe(branchId);
  });
});