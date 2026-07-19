import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildHeaders } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("buildHeaders", () => {
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
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api("/api/health")).rejects.toThrow("تعذر الاتصال بالخادم");
  });
});
