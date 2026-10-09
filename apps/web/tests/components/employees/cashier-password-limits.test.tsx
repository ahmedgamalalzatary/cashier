import type { Employee } from "@cashier/shared";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isElement = (node: unknown): node is ReactElement =>
  typeof node === "object" && node !== null && "props" in node;

const hooks = vi.hoisted(() => ({ state: [] as unknown[], cursor: 0 }));
const calls = vi.hoisted(() => ({
  resetCashierPassword: vi.fn(),
  grantCashierAccess: vi.fn(),
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
vi.mock("@/services/employees-service", () => ({
  resetCashierPassword: calls.resetCashierPassword,
  grantCashierAccess: calls.grantCashierAccess,
}));

import { CashierPasswordModal } from "../../../src/components/employees/cashier-password-modal";
import { CashierAccessModal } from "../../../src/components/employees/cashier-access-modal";
import { Field } from "@cashier/web-core/components/ui/field";

const employee = {
  id: "019a1234-5678-7000-8000-000000000001",
  name: "أحمد",
} as Employee;

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

type FieldProps = { onChange: (event: unknown) => void };
type FormProps = { onSubmit: (event: unknown) => void };

/** The password is bcrypt's limit in bytes, not characters. */
const overLong = "ا".repeat(37);

/** Types into the nth field, re-rendering so the next handler sees the value. */
function fill(view: () => ReactElement, index: number, value: string) {
  const field = ofType(view(), Field)[index];
  (field.props as FieldProps).onChange({ target: { value } });
}

function submit(view: () => ReactElement) {
  const [form] = ofType(view(), "form");
  return (form!.props as FormProps).onSubmit({ preventDefault: () => {} });
}

beforeEach(() => {
  hooks.state = [];
  hooks.cursor = 0;
  calls.resetCashierPassword.mockReset().mockResolvedValue(undefined);
  calls.grantCashierAccess.mockReset().mockResolvedValue(undefined);
});

describe("setting a cashier password", () => {
  // Each render starts from the first hook, the way the real component mounts.
  const passwordModal = () => {
    hooks.cursor = 0;
    return CashierPasswordModal({
      employee,
      onClose: vi.fn(),
      onSaved: vi.fn(),
    }) as ReactElement;
  };
  const accessModal = () => {
    hooks.cursor = 0;
    return CashierAccessModal({
      employee,
      onClose: vi.fn(),
      onSaved: vi.fn(),
    }) as ReactElement;
  };

  it("still sets a password inside the limit", async () => {
    fill(passwordModal, 0, "secret123");

    await submit(passwordModal);

    expect(calls.resetCashierPassword).toHaveBeenCalledWith(
      employee.id,
      "secret123",
    );
  });

  it("refuses a password past bcrypt's 72 bytes before calling the server", async () => {
    fill(passwordModal, 0, overLong);

    await submit(passwordModal);

    expect(calls.resetCashierPassword).not.toHaveBeenCalled();
    expect(text(passwordModal())).toMatch(/72/);
  });

  it("refuses the same over-long password when granting cashier access", async () => {
    fill(accessModal, 0, "cashier-1");
    fill(accessModal, 1, overLong);

    await submit(accessModal);

    expect(calls.grantCashierAccess).not.toHaveBeenCalled();
    expect(text(accessModal())).toMatch(/72/);
  });

  it("still grants access with a password inside the limit", async () => {
    fill(accessModal, 0, "cashier-1");
    fill(accessModal, 1, "secret123");

    await submit(accessModal);

    expect(calls.grantCashierAccess).toHaveBeenCalledWith(employee.id, {
      username: "cashier-1",
      password: "secret123",
    });
  });
});