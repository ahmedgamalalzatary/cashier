import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "@cashier/web-core/features/login-page";

vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), user: null }),
}));

describe("online login page", () => {
  it("offers no cashier choice, so a submitted form can only be an admin", () => {
    const markup = renderToStaticMarkup(<LoginPage adminsOnly />);

    expect(markup).not.toContain("<select");
    expect(markup).not.toContain('value="cashier"');
    expect(markup).toMatch(/name="role"[^>]*value="admin"/);
  });

  it("keeps the desktop login asking for the account type", () => {
    const markup = renderToStaticMarkup(<LoginPage />);

    expect(markup).toMatch(/<option value="cashier"[^>]*>كاشير/);
    expect(markup).toMatch(/<option value="admin"[^>]*>مدير/);
  });
});