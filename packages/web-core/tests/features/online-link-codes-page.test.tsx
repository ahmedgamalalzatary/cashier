import type { AuthUser } from "@cashier/shared";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isElement = (node: unknown): node is ReactElement =>
  typeof node === "object" && node !== null && "props" in node;

const hooks = vi.hoisted(() => ({
  user: null as AuthUser | null,
  state: [] as unknown[],
  cursor: 0,
}));
const calls = vi.hoisted(() => ({ generateLinkCode: vi.fn() }));
const scope = vi.hoisted(() => ({
  branches: [
    {
      id: "019a1234-5678-7000-8000-000000000001",
      name: "فرع الشمال",
      isActive: true,
    },
    {
      id: "019a1234-5678-7000-8000-000000000002",
      name: "فرع الجنوب",
      isActive: true,
    },
  ] as { id: string; name: string; isActive: boolean }[],
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] =
          typeof value === "function" ? value(hooks.state[index]) : value;
      },
    ];
  },
}));
vi.mock("../../src/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: hooks.user }),
}));
vi.mock("../../src/components/branches/branch-provider", () => ({
  useBranch: () => ({ branches: scope.branches, refresh: vi.fn() }),
}));
vi.mock("../../src/services/link-codes-service", () => ({
  generateLinkCode: calls.generateLinkCode,
}));

import { OnlineLinkCodesPage } from "../../src/features/online-link-codes-page";
import { Button } from "../../src/components/ui/button";
import { SelectField } from "../../src/components/ui/select-field";

const superAdmin: AuthUser = {
  id: "019a1234-5678-7000-8000-000000000001",
  name: "Owner",
  role: "admin",
  isSuperAdmin: true,
};
const plainAdmin: AuthUser = { ...superAdmin, isSuperAdmin: false };

function render(): ReactElement {
  hooks.cursor = 0;
  return OnlineLinkCodesPage() as ReactElement;
}
function nodes(node: ReactNode, found: ReactElement[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) nodes(child, found);
    return found;
  }
  if (!isElement(node)) return found;
  found.push(node);
  nodes((node.props as { children?: ReactNode }).children, found);
  return found;
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (isElement(node))
    return text((node.props as { children?: ReactNode }).children);
  return "";
}
const ofType = (node: ReactNode, type: unknown) =>
  nodes(node).filter((child) => child.type === type);
function buttonLabelled(label: string) {
  const [button] = ofType(render(), Button).filter((child) =>
    text(child).trim().includes(label),
  );
  return button.props as {
    onClick: () => void | Promise<void>;
    disabled?: boolean;
  };
}

function chooseBranch(id: string) {
  const [picker] = ofType(render(), SelectField);
  (picker.props as { onChange: (event: unknown) => void }).onChange({
    target: { value: id },
  });
}

beforeEach(() => {
  hooks.state = [];
  hooks.cursor = 0;
  hooks.user = superAdmin;
  calls.generateLinkCode.mockReset().mockResolvedValue({
    code: "ABCD2345",
    expiresAt: "2026-10-09T00:00:00.000Z",
  });
});

describe("online link code screen", () => {
  it("refuses an admin that is not the super-admin", () => {
    hooks.user = plainAdmin;

    expect(text(render())).toContain("لا تملك صلاحية إنشاء أكواد الربط");
    expect(ofType(render(), Button)).toHaveLength(0);
  });

  it("shows no code before one is asked for", () => {
    expect(text(render())).not.toContain("ABCD2345");
  });

  it("mints a code for the branch that was chosen", async () => {
    chooseBranch(scope.branches[1].id);

    await buttonLabelled("إنشاء كود ربط").onClick();

    expect(calls.generateLinkCode).toHaveBeenCalledWith(scope.branches[1].id);
  });

  it("shows the generated code and when it expires", async () => {
    chooseBranch(scope.branches[0].id);

    await buttonLabelled("إنشاء كود ربط").onClick();
    render();

    expect(text(render())).toContain("ABCD2345");
    expect(text(render())).toContain("ينتهي خلال 24 ساعة");
  });

  it("warns that the code is shown only this once", async () => {
    chooseBranch(scope.branches[0].id);

    await buttonLabelled("إنشاء كود ربط").onClick();
    render();

    expect(text(render())).toContain("لن يظهر هذا الكود مرة أخرى");
  });

  it("keeps the branch it is pointing at rather than resetting to the first", async () => {
    chooseBranch(scope.branches[1].id);
    await buttonLabelled("إنشاء كود ربط").onClick();
    render();

    expect(text(render())).toContain("فرع الجنوب");
  });

  it("keeps the mint button out of reach until a branch is chosen", () => {
    expect(buttonLabelled("إنشاء كود ربط").disabled).toBe(true);

    chooseBranch(scope.branches[0].id);
    expect(buttonLabelled("إنشاء كود ربط").disabled).toBe(false);
  });

  it("reports a refused code instead of leaving the screen silent", async () => {
    hooks.state = [];
    chooseBranch(scope.branches[0].id);
    calls.generateLinkCode.mockRejectedValueOnce(
      new Error("أحد الفروع غير موجود"),
    );

    await buttonLabelled("إنشاء كود ربط").onClick();
    render();

    expect(text(render())).toContain("أحد الفروع غير موجود");
  });
});
