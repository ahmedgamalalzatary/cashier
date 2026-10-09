import type { Branch } from "@cashier/shared";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = vi.hoisted(() => ({
  branch: null as Branch | null,
  branches: [] as Branch[],
  selectBranch: vi.fn(),
}));

vi.mock("@cashier/web-core/components/branches/branch-provider", () => ({
  useBranch: () => ({
    branch: scope.branch,
    branches: scope.branches,
    selectBranch: scope.selectBranch,
  }),
}));

import { BranchPicker } from "@/components/branch-picker";

const active: Branch = {
  id: "019a1234-5678-7000-8000-000000000001",
  name: "فرع الشمال",
  isActive: true,
  createdAt: "2026-10-08T00:00:00Z",
};
const archived: Branch = { ...active, id: active.id.replace("1", "2"), name: "فرع قديم", isActive: false };

function elements(node: ReactNode, found: ReactElement[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found);
    return found;
  }
  if (typeof node !== "object" || node === null || !("props" in node))
    return found;
  found.push(node as ReactElement);
  elements((node.props as { children?: ReactNode }).children, found);
  return found;
}

beforeEach(() => {
  scope.branch = active;
  scope.branches = [active, archived];
  scope.selectBranch.mockClear();
});

describe("online branch picker", () => {
  it("offers the branches this admin may read, marking an archived one", () => {
    const html = renderToStaticMarkup(BranchPicker() as never);

    expect(html).toContain("فرع الشمال");
    expect(html).toContain("فرع قديم (مؤرشف)");
  });

  it("passes a chosen branch to the provider", () => {
    const select = elements(BranchPicker() as never).find(
      (node) => node.type === "select",
    )!;

    (select.props as { onChange: (event: unknown) => void }).onChange({
      target: { value: archived.id },
    });

    expect(scope.selectBranch).toHaveBeenCalledWith(archived.id);
  });

  it("shows that there is no branch instead of an empty dropdown", () => {
    scope.branch = null;
    scope.branches = [];

    const rendered = elements(BranchPicker() as never);

    expect(rendered.filter((node) => node.type === "select")).toEqual([]);
    expect(renderToStaticMarkup(BranchPicker() as never)).toContain("لا يوجد فرع");
  });
});