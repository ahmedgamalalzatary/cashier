import { describe, expect, it } from "vitest";
import { buildHeaders } from "./api";

describe("buildHeaders", () => {
  it("preserves Headers input and caller precedence", () => {
    const headers = buildHeaders(new Headers({ "Content-Type": "text/plain", Authorization: "Custom token" }), "session-token");

    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("Authorization")).toBe("Custom token");
  });

  it("preserves tuple-array headers while adding defaults", () => {
    const headers = buildHeaders([["X-Request-Id", "123"]], "session-token");

    expect(headers.get("X-Request-Id")).toBe("123");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });
});
