import type { AuthUser } from "@cashier/shared";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// react is mocked below for its hooks, so element detection stays local.
const isElement = (node: unknown): node is ReactElement =>
  typeof node === "object" && node !== null && "props" in node;

const hooks = vi.hoisted(() => ({
  user: null as AuthUser | null,
  state: [] as unknown[],
  cursor: 0,
}));
const calls = vi.hoisted(() => ({
  listAdmins: vi.fn(),
  createAdmin: vi.fn(),
  updateAdmin: vi.fn(),
  assignAdminBranches: vi.fn(),
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
      isActive: true,
    },
  ] as { id: string; name: string; isActive: boolean }[],
  accounts: [
    {
      id: "019a1234-5678-7000-8000-000000000010",
      name: "مدير الفروع",
      username: "branch-manager",
      role: "admin" as const,
      isActive: true,
      isSuperAdmin: false,
      createdAt: "2026-10-08T00:00:00Z",
      branchIds: ["019a1234-5678-7000-8000-000000000001"],
    },
    {
      id: "019a1234-5678-7000-8000-000000000011",
      name: "مدير موقوف",
      username: "disabled-manager",
      role: "admin" as const,
      isActive: false,
      isSuperAdmin: false,
      createdAt: "2026-10-08T00:00:00Z",
      branchIds: [],
    },
  ],
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
  // The accounts load on mount; these tests read the rendered rows directly.
  useEffect: (effect: () => void) => {
    void effect();
  },
}));
vi.mock("../../src/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: hooks.user }),
}));
vi.mock("../../src/components/branches/branch-provider", () => ({
  useBranch: () => ({ branches: scope.branches, refresh: vi.fn() }),
}));
vi.mock("../../src/services/admins-service", () => ({
  listAdmins: calls.listAdmins,
  createAdmin: calls.createAdmin,
  updateAdmin: calls.updateAdmin,
  assignAdminBranches: calls.assignAdminBranches,
}));

import { OnlineAdminsPage } from "../../src/features/online-admins-page";
import { Button } from "../../src/components/ui/button";
import { DataTable, type DataColumn } from "../../src/components/ui/data-table";
import { Field } from "../../src/components/ui/field";
import { Modal } from "../../src/components/ui/modal";
import { PageHeader } from "../../src/components/ui/page-header";
import { ConfirmDialog } from "../../src/components/ui/confirm-dialog";

const superAdmin: AuthUser = {
  id: "019a1234-5678-7000-8000-000000000001",
  name: "Owner",
  role: "admin",
  isSuperAdmin: true,
};
const plainAdmin: AuthUser = { ...superAdmin, isSuperAdmin: false };

type Account = (typeof scope.accounts)[number];

function render(): ReactElement {
  hooks.cursor = 0;
  return OnlineAdminsPage() as ReactElement;
}
/** The accounts load on mount, so flush that promise before reading the rows. */
async function loaded() {
  render();
  await Promise.resolve();
  await Promise.resolve();
  render();
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
const table = () =>
  rendered(DataTable)[0].props as {
    rows: Account[];
    columns: DataColumn<Account>[];
    actions: (row: Account) => ReactNode;
  };
const columnText = (key: string, row: Account) =>
  text(
    table()
      .columns.find((column) => column.key === key)!
      .cell(row) as ReactNode,
  );
const rowFor = (username: string) =>
  table().rows.find((row) => row.username === username)!;

beforeEach(() => {
  hooks.state = [];
  hooks.user = superAdmin;
  calls.listAdmins.mockReset().mockResolvedValue(scope.accounts);
  calls.createAdmin.mockReset().mockResolvedValue({ id: "new-id" });
  calls.updateAdmin.mockReset().mockResolvedValue({ ok: true });
  calls.assignAdminBranches.mockReset().mockResolvedValue({ ok: true });
});

describe("online admin management screen", () => {
  it("refuses an admin that is not the super-admin", () => {
    hooks.user = plainAdmin;

    expect(text(render())).toContain("لا تملك صلاحية إدارة المديرين");
    expect(ofType(render(), DataTable)).toHaveLength(0);
  });

  it("lists each admin with the branches it may read", async () => {
    await loaded();
    const rows = table().rows;

    expect(rows.map((row) => row.username)).toEqual([
      "branch-manager",
      "disabled-manager",
    ]);
    expect(columnText("branches", rows[0])).toContain("فرع الشمال");
    expect(columnText("status", rows[0])).toContain("نشط");
    expect(columnText("status", rows[1])).toContain("موقوف");
  });

  it("marks the super-admin account as read-only", async () => {
    await loaded();
    const owner: Account = {
      id: superAdmin.id,
      name: superAdmin.name,
      username: "owner",
      role: "admin",
      isActive: true,
      isSuperAdmin: true,
      createdAt: "2026-10-08T00:00:00Z",
      branchIds: [],
    };

    expect(columnText("status", owner)).toContain("من إعدادات الخادم");
  });

  it("offers no edit control for the super-admin's own account", async () => {
    await loaded();
    const owner: Account = {
      id: superAdmin.id,
      name: superAdmin.name,
      username: "owner",
      role: "admin",
      isActive: true,
      isSuperAdmin: true,
      createdAt: "2026-10-08T00:00:00Z",
      branchIds: [],
    };
    const controls = ofType(table().actions(owner), Button);

    expect(controls).toHaveLength(0);
  });

  it("creates an admin assigned to the branches that were picked", async () => {
    await loaded();
    const header = rendered(PageHeader)[0].props as { actions?: ReactNode };
    const addButton = ofType(header.actions, Button).find((button) =>
      text(button).includes("إضافة مدير"),
    )!;
    (addButton.props as { onClick: () => void }).onClick();
    const modalChildren = () =>
      (rendered(Modal)[0].props as { children?: ReactNode }).children;
    // The three text fields sit in a fixed order; each handler closes over the form
    // it was built with, so the modal is re-read between edits.
    const values = ["مدير جديد", "new-manager", "secret123"];
    for (const [index, value] of values.entries()) {
      const field = ofType(modalChildren(), Field)[index];
      (field.props as { onChange: (event: unknown) => void }).onChange({
        target: { value },
      });
    }
    const [firstCheckbox] = ofType(modalChildren(), "input").filter(
      (input) => (input.props as { type?: string }).type === "checkbox",
    );
    (firstCheckbox.props as { onChange: (event: unknown) => void }).onChange({
      target: { checked: true },
    });
    const [formElement] = ofType(modalChildren(), "form");

    await (
      formElement!.props as { onSubmit: (event: unknown) => void }
    ).onSubmit({ preventDefault: () => {} });

    expect(calls.createAdmin).toHaveBeenCalledWith({
      name: "مدير جديد",
      username: "new-manager",
      password: "secret123",
      branchIds: [scope.branches[0].id],
    });
  });

  it("replaces an admin's branches with the new selection", async () => {
    await loaded();
    const row = rowFor("branch-manager");
    const edit = ofType(table().actions(row), Button).find((button) =>
      text(button).includes("تعديل"),
    )!;
    (edit.props as { onClick: () => void }).onClick();
    const checkboxes = ofType(
      (rendered(Modal)[0].props as { children?: ReactNode }).children,
      "input",
    ).filter((input) => (input.props as { type?: string }).type === "checkbox");
    const second = checkboxes[1];
    (second.props as { onChange: (event: unknown) => void }).onChange({
      target: { checked: true },
    });
    const [form] = ofType(
      (rendered(Modal)[0].props as { children?: ReactNode }).children,
      "form",
    );

    await (form!.props as { onSubmit: (event: unknown) => void }).onSubmit({
      preventDefault: () => {},
    });

    expect(calls.assignAdminBranches).toHaveBeenCalledWith(row.id, [
      scope.branches[0].id,
      scope.branches[1].id,
    ]);
  });

  it("deactivates an admin instead of deleting the account", async () => {
    await loaded();
    const row = rowFor("branch-manager");
    const deactivate = ofType(table().actions(row), Button).find((button) =>
      text(button).includes("إيقاف"),
    )!;
    (deactivate.props as { onClick: () => void }).onClick();
    const confirm = rendered(ConfirmDialog)[0];

    await (confirm.props as { onConfirm: () => void }).onConfirm();

    expect(calls.updateAdmin).toHaveBeenCalledWith(row.id, { isActive: false });
  });

  it("never offers a delete control", async () => {
    await loaded();
    const controls = table()
      .rows.flatMap((row) => ofType(table().actions(row), Button))
      .map((button) => text(button));

    expect(controls.some((label) => label.includes("حذف"))).toBe(false);
  });
});
