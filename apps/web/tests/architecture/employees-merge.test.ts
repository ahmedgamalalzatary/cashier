import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(process.cwd());
const read = (relative: string) =>
  fs.readFileSync(path.join(webRoot, relative), "utf8");

describe("employees and salaries merge onto one page", () => {
  it("deletes the separate /salaries route", () => {
    expect(fs.existsSync(path.join(webRoot, "src/app/salaries"))).toBe(false);
  });

  it("shows the salaries tab from /employees with the tab in the URL", () => {
    const page = read("src/app/employees/page.tsx");
    expect(page).toContain("salaries-tab");
    expect(page).toContain("?tab=");
    expect(page).toContain("<Tabs");
  });

  it("removes the salaries sidebar entry and its icon mapping", () => {
    expect(
      read("../../packages/web-core/src/lib/navigation.ts"),
    ).not.toContain('"/salaries"');
    expect(read("src/components/layout/sidebar.tsx")).not.toContain(
      '"/salaries"',
    );
  });

  it("shows the salaries tab with its own flows", () => {
    const tab = read("src/components/salaries/salaries-tab.tsx");
    expect(tab).toContain("getSalaryMonth");
    expect(tab).toContain("صرف جزء من الراتب");
  });
});
