import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");
}

describe("user management boundaries", () => {
  it("keeps cashier account actions in the employee feature", () => {
    const page = read("src/app/users/page.tsx");

    expect(page).toContain('user.role !== "admin"');
    expect(page).toContain("يُدار من سجل الموظف");
  });

  it("gates admin management on the super-admin and marks the managed account", () => {
    const page = read("src/app/users/page.tsx");

    expect(page).toContain("currentUser?.isSuperAdmin");
    expect(page).toContain("user.isSuperAdmin");
    expect(page).toContain("المدير الرئيسي");
    expect(page).toContain("يُدار من إعدادات الخادم");
    expect(page).toContain("عرض فقط");
  });

  it("no longer exposes a self password change", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");

    expect(sidebar).not.toContain("تغيير كلمة المرور");
    expect(sidebar).not.toContain("ChangePasswordModal");
  });
});
