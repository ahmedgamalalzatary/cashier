import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../src");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("expenses feature", () => {
  it("uses the expenses service instead of a coming-soon page", () => {
    const page = read("app/expenses/page.tsx");
    expect(page).toContain("@/services/expenses-service");
    expect(page).not.toContain("ComingSoonPage");
  });

  it("exposes category and expense API operations", () => {
    const service = read("services/expenses-service.ts");
    expect(service).toContain("/api/expenses/categories");
    expect(service).toContain('api<ExpenseSummary[]>("/api/expenses")');
    expect(service).toContain('method: "POST"');
    expect(service).toContain('method: "PATCH"');
  });
});
