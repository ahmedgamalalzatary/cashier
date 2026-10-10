import type { AuthUser, Branch } from "@cashier/shared";
import { testId } from "@cashier/shared/test-support";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// react is mocked below for its hooks, so element detection stays local.
const isElement = (node: unknown): node is ReactElement =>
  typeof node === "object" && node !== null && "props" in node;

const hooks = vi.hoisted(() => ({
  user: null as AuthUser | null,
  state: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
}));
const calls = vi.hoisted(() => ({
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  archiveBranch: vi.fn(),
  refresh: vi.fn(),
  listDeviceStatus: vi.fn(),
}));
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
      isActive: false,
    },
  ] as Branch[],
}));

// Client hooks are driven by hand here: this repo renders components without a DOM.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void) => {
    hooks.effects.push(effect);
  },
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
  useBranch: () => ({ branches: scope.branches, refresh: calls.refresh }),
}));
vi.mock("../../src/services/devices-service", () => ({
  listDeviceStatus: calls.listDeviceStatus,
}));
vi.mock("../../src/services/branches-service", () => ({
  createBranch: calls.createBranch,
  updateBranch: calls.updateBranch,
  archiveBranch: calls.archiveBranch,
}));

import { OnlineBranchesPage } from "../../src/features/online-branches-page";
import { ConfirmDialog } from "../../src/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "../../src/components/ui/data-table";
import { Field } from "../../src/components/ui/field";
import { Modal } from "../../src/components/ui/modal";
import { PageHeader } from "../../src/components/ui/page-header";
import { Button } from "../../src/components/ui/button";

const superAdmin: AuthUser = {
  id: testId(9),
  name: "Owner",
  role: "admin",
  isSuperAdmin: true,
};
const plainAdmin: AuthUser = {
  ...superAdmin,
  id: testId(8),
  isSuperAdmin: false,
};

function render(): ReactElement {
  hooks.cursor = 0;
  return OnlineBranchesPage() as ReactElement;
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
const rendered = (type: unknown) => ofType(render(), type);

beforeEach(() => {
  hooks.state = [];
  hooks.effects = [];
  hooks.user = superAdmin;
  calls.listDeviceStatus.mockReset().mockResolvedValue([]);
  calls.createBranch.mockReset().mockResolvedValue(scope.branches[0]);
  calls.updateBranch.mockReset().mockResolvedValue(scope.branches[0]);
  calls.archiveBranch.mockReset().mockResolvedValue(scope.branches[0]);
  calls.refresh.mockReset().mockResolvedValue(undefined);
});

describe("online branch management screen", () => {
  it("shows each branch's desktop version, last contact and last backup", async () => {
    calls.listDeviceStatus.mockResolvedValue([
      {
        branchId: scope.branches[0].id,
        appVersion: "0.2.5",
        linkedAt: "2026-10-01T10:00:00.000Z",
        lastSeenAt: "2026-10-10T10:00:00.000Z",
        lastUploadAt: "2026-10-10T09:30:00.000Z",
      },
    ]);
    render();
    vi.useFakeTimers();
    for (const effect of hooks.effects) effect();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();

    const page = render();
    const table = ofType(page, DataTable)[0].props as {
      rows: Branch[];
      columns: DataColumn<Branch>[];
    };
    const cell = (key: string, row: Branch) =>
      text(table.columns.find((column) => column.key === key)!.cell(row) as ReactNode);

    expect(cell("version", table.rows[0])).toContain("0.2.5");
    expect(cell("version", table.rows[1])).toContain("غير مرتبط");
    expect(cell("lastSeen", table.rows[0])).not.toBe("");
    expect(cell("lastUpload", table.rows[0])).not.toBe("");
    expect(cell("lastUpload", table.rows[1])).toContain("—");
    expect(text(page)).toContain("الإصدارات المستخدمة");
    expect(text(page)).toContain("0.2.5");
  });

  it("refuses an admin that is not the super-admin", () => {
    hooks.user = plainAdmin;

    expect(text(render())).toContain("لا تملك صلاحية إدارة الفروع");
    expect(ofType(render(), DataTable)).toHaveLength(0);
  });

  it("lists every branch with its state", () => {
    const table = rendered(DataTable)[0].props as {
      rows: Branch[];
      columns: DataColumn<Branch>[];
    };
    const statusCell = table.columns.find((column) => column.key === "status");

    expect(table.rows.map((row) => row.name)).toEqual([
      "فرع الشمال",
      "فرع الجنوب",
    ]);
    expect(
      text(statusCell!.cell(table.rows[1]) as ReactNode),
    ).toContain("مؤرشف");
  });

  it("creates a branch through the online API", async () => {
    const header = rendered(PageHeader)[0].props as { actions?: ReactNode };
    const addButton = ofType(header.actions, Button).find((button) =>
      text(button).includes("إضافة فرع"),
    )!;
    (addButton.props as { onClick: () => void }).onClick();
    const field = ofType(
      (rendered(Modal)[0].props as { children?: ReactNode }).children,
      Field,
    )[0];
    (field.props as { onChange: (event: unknown) => void }).onChange({
      target: { value: "فرع جديد" },
    });
    const [form] = ofType(
      (rendered(Modal)[0].props as { children?: ReactNode }).children,
      "form",
    );

    await (form!.props as { onSubmit: (event: unknown) => void }).onSubmit({
      preventDefault: () => {},
    });

    expect(calls.createBranch).toHaveBeenCalledWith("فرع جديد");
    expect(calls.refresh).toHaveBeenCalled();
  });

  it("archives a branch only after the super-admin confirms", async () => {
    const actionsFor = (row: Branch) => {
      const table = rendered(DataTable)[0].props as {
        actions: (row: Branch) => ReactNode;
      };
      return ofType(table.actions(row), Button);
    };
    actionsFor(scope.branches[0])
      .filter((button) => text(button).includes("أرشفة"))
      .forEach((button) =>
        (button.props as { onClick: () => void }).onClick(),
      );
    const dialog = rendered(ConfirmDialog)[0];

    await (dialog.props as { onConfirm: () => void }).onConfirm();

    expect(calls.archiveBranch).toHaveBeenCalledWith(scope.branches[0].id);
  });

  it("reopens an archived branch and offers no archive control for it", async () => {
    const archived = scope.branches.find((branch) => !branch.isActive)!;
    const table = rendered(DataTable)[0].props as {
      actions: (row: Branch) => ReactNode;
    };
    const controls = ofType(table.actions(archived), Button);
    const reopen = controls.find((button) =>
      text(button).includes("إعادة فتح"),
    )!;

    await (reopen.props as { onClick: () => Promise<void> }).onClick();

    expect(controls.some((button) => text(button).includes("أرشفة"))).toBe(
      false,
    );
    expect(calls.updateBranch).toHaveBeenCalledWith(archived.id, {
      isActive: true,
    });
  });
});