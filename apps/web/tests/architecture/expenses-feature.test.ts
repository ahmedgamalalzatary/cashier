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

  it("clears the form once the expense is created", () => {
    const form = read("components/expenses/expense-entry-form.tsx");
    const created = form.indexOf("await createExpense(");
    const clear = form.indexOf('setAmount("")');

    expect(created).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(created);
  });

  it("reports a refresh failure after a saved expense instead of hiding it", () => {
    const page = read("app/expenses/page.tsx");
    expect(page).not.toContain("load().catch(() => undefined)");
    expect(page).toMatch(
      /onSaved=\{[\s\S]*?load\(\)\.catch\([\s\S]*?تم تسجيل المصروف، لكن تعذر تحديث البيانات/,
    );
  });
});
