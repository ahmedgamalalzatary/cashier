import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(new URL(`../../../src/${relative}`, import.meta.url), "utf8");

describe("employee salary is monthly only", () => {
  it("offers a single monthly salary field with no pay-type choice", () => {
    const modal = source("components/employees/employee-modal.tsx");

    expect(modal).toContain("الراتب الشهري");
    expect(modal).not.toContain("نوع الأجر");
    expect(modal).not.toContain("employeePayPayload");
  });

  it("shows the monthly salary alone in the employee list", () => {
    const page = source("app/employees/page.tsx");

    expect(page).toContain("الراتب الشهري");
    expect(page).not.toContain("payType");
  });
});