import { testId } from "@cashier/shared/test-support";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = vi.hoisted(() => {
  const branches = [
    { id: "019a1234-5678-7000-8000-000000000001", name: "الفرع الرئيسي", isActive: true },
    { id: "019a1234-5678-7000-8000-000000000002", name: "فرع المعادي", isActive: false },
  ];
  return { branches, current: branches[0], selectBranch: vi.fn() };
});

vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: testId(9),
      name: "Manager",
      role: "admin",
      branchId: null,
      isSuperAdmin: true,
    },
    logout: vi.fn(),
  }),
}));
// online-api returns only the branches this admin may read, so the provider's
// list is already scoped; the picker may not widen it.
vi.mock("@cashier/web-core/components/branches/branch-provider", () => ({
  useBranch: () => ({
    branch: scope.current,
    branches: scope.branches,
    selectBranch: scope.selectBranch,
    refresh: vi.fn(),
  }),
}));

import { BranchPicker } from "@/components/branch-picker";

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

const rendered = () => elements(BranchPicker() as ReactNode);

beforeEach(() => {
  scope.selectBranch.mockClear();
});

describe("online branch picker", () => {
  it("offers one option per branch the online API allowed", () => {
    const options = rendered().filter((node) => node.type === "select" ? false : node.type === "option");

    expect(
      options.map((node) => [
        (node.props as { value: string }).value,
        (node.props as { children: ReactNode }).children,
      ]),
    ).toEqual([
      [scope.branches[0].id, "الفرع الرئيسي"],
      [scope.branches[1].id, "فرع المعادي (مؤرشف)"],
    ]);
  });

  it("starts on the branch that is currently open", () => {
    const select = rendered().find((node) => node.type === "select");

    expect((select!.props as { value: string }).value).toBe(
      scope.current.id,
    );
  });

  it("switches branch through the shared provider", () => {
    const select = rendered().find((node) => node.type === "select");
    const onChange = (select!.props as { onChange: (event: unknown) => void })
      .onChange;

    onChange({ target: { value: scope.branches[1].id } });

    expect(scope.selectBranch).toHaveBeenCalledWith(scope.branches[1].id);
  });
});