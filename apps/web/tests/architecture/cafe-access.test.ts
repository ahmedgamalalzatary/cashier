import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cafe cashier access", () => {
  it("does not load the admin-only items endpoint", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../../src/app/cafe/page.tsx"),
      "utf8",
    );
    expect(source).not.toContain("@/services/items-service");
    expect(source).not.toContain("listItems(");
  });
});
