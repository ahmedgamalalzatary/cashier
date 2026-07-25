import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("user management boundaries", () => {
  it("keeps cashier account actions in the employee feature", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/users/page.tsx"),
      "utf8",
    );

    expect(page).toContain('user.role === "admin"');
    expect(page).toContain("يُدار من سجل الموظف");
  });
});
