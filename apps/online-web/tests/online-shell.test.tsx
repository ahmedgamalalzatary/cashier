import { testId } from "@cashier/shared/test-support";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = vi.hoisted(() => ({
  user: null as { id: string; name: string } | null,
  logout: vi.fn(),
}));

vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: scope.user, logout: scope.logout, login: vi.fn() }),
}));
vi.mock("@/components/branch-picker", () => ({ BranchPicker: () => null }));

import { OnlineShell } from "@/components/online-shell";

function elements(node: ReactNode, found: ReactElement[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  found.push(node);
  elements((node.props as { children?: ReactNode }).children, found);
  return found;
}

const signedIn = (isSuperAdmin = true) => {
  scope.user = {
    id: testId(9),
    name: "Manager",
    role: "admin",
    branchId: null,
    isSuperAdmin,
  } as never;
};

const linksTo = (pathname: string) =>
  elements(OnlineShell({ children: "reports" }) as never).filter(
    (node) => (node.props as { href?: string }).href === pathname,
  );

beforeEach(() => {
  scope.user = null;
  scope.logout.mockClear();
});

describe("online shell", () => {
  it("keeps the sign-in page free of the branch header", () => {
    const rendered = elements(OnlineShell({ children: "reports" }) as never);

    expect(rendered.filter((node) => node.type === "header")).toEqual([]);
  });

  it("offers the branch picker and a way out once signed in", () => {
    signedIn();
    const rendered = elements(OnlineShell({ children: "reports" }) as never);
    const logoutControl = rendered.find(
      (node) =>
        (node.props as { children?: ReactNode }).children === "تسجيل الخروج",
    );

    expect(rendered.filter((node) => node.type === "header")).toHaveLength(1);
    (logoutControl!.props as { onClick: () => void }).onClick();
    expect(scope.logout).toHaveBeenCalledOnce();
  });

  it("offers branch management to the super-admin only", () => {
    signedIn(true);
    expect(linksTo("/branches")).toHaveLength(1);

    signedIn(false);
    expect(linksTo("/branches")).toHaveLength(0);
  });

  it("offers admin management to the super-admin only", () => {
    signedIn(true);
    expect(linksTo("/admins")).toHaveLength(1);

    signedIn(false);
    expect(linksTo("/admins")).toHaveLength(0);
  });
});
