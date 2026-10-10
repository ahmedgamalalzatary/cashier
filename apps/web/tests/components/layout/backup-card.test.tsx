import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BackupCardView } from "../../../src/components/layout/backup-card";

type Node = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}>;

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text((node as Node).props.children);
}
function button(node: ReactNode): Node | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(button).find(Boolean);
  const element = node as Node;
  if (element.type === "button") return element;
  return button(element.props.children);
}

function buttons(node: ReactNode): Node[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  const element = node as Node;
  return [
    ...(element.type === "button" ? [element] : []),
    ...buttons(element.props.children),
  ];
}

const status = {
  lastSuccessAt: "2026-10-09T10:00:00.000Z",
  lastAttemptAt: null as string | null,
  lastError: null as string | null,
  pending: 0,
};

describe("backup card", () => {
  it("says when the last backup succeeded", () => {
    const card = BackupCardView({
      status,
      uploading: false,
      onUploadNow: vi.fn(),
    });

    expect(text(card)).toContain("تم آخر رفع");
  });

  it("says so plainly when no backup has succeeded yet", () => {
    const card = BackupCardView({
      status: { ...status, lastSuccessAt: null },
      uploading: false,
      onUploadNow: vi.fn(),
    });

    expect(text(card)).toContain("لم يتم");
  });

  it("shows how much is still waiting", () => {
    const card = BackupCardView({
      status: { ...status, pending: 12 },
      uploading: false,
      onUploadNow: vi.fn(),
    });

    expect(text(card)).toContain("12");
  });

  it("starts an upload on request", () => {
    const onUploadNow = vi.fn();
    const card = BackupCardView({ status, uploading: false, onUploadNow });
    const action = button(card)!;

    expect(text(action)).toContain("رفع الآن");
    action.props.onClick!();
    expect(onUploadNow).toHaveBeenCalledOnce();
  });

  it("cannot be pressed again while an upload is running", () => {
    const card = BackupCardView({
      status,
      uploading: true,
      onUploadNow: vi.fn(),
    });

    expect(button(card)!.props.disabled).toBe(true);
    expect(text(card)).toContain("جارٍ");
  });

  it("reports a failed backup without hiding the button", () => {
    const card = BackupCardView({
      status: { ...status, lastError: "تعذر الاتصال بالموقع" },
      uploading: false,
      onUploadNow: vi.fn(),
    });

    expect(text(card)).toContain("تعذر الاتصال بالموقع");
    expect(button(card)!.props.disabled).toBe(false);
  });
});

describe("resend everything control", () => {
  it("is offered so an admin can rebuild the whole backup", () => {
    const card = BackupCardView({
      status,
      uploading: false,
      onUploadNow: vi.fn(),
      onResendAll: vi.fn(),
    });

    const resend = buttons(card).find((node) =>
      text(node).includes("إعادة الإرسال"),
    );
    expect(resend).toBeDefined();
    resend!.props.onClick!();
  });

  it("asks for confirmation before queueing everything again", () => {
    const onResendAll = vi.fn();
    const card = BackupCardView({
      status,
      uploading: false,
      onUploadNow: vi.fn(),
      onResendAll,
      confirm: () => false,
    });

    buttons(card)
      .find((node) => text(node).includes("إعادة الإرسال"))!
      .props.onClick!();

    expect(onResendAll).not.toHaveBeenCalled();
  });

  it("resends once the admin agrees", () => {
    const onResendAll = vi.fn();
    const card = BackupCardView({
      status,
      uploading: false,
      onUploadNow: vi.fn(),
      onResendAll,
      confirm: () => true,
    });

    buttons(card)
      .find((node) => text(node).includes("إعادة الإرسال"))!
      .props.onClick!();

    expect(onResendAll).toHaveBeenCalledOnce();
  });

  it("stays locked while a resend is running", () => {
    const card = BackupCardView({
      status,
      uploading: true,
      onUploadNow: vi.fn(),
      onResendAll: vi.fn(),
    });

    for (const node of buttons(card)) expect(node.props.disabled).toBe(true);
  });

  it("is hidden when the caller does not offer it", () => {
    const card = BackupCardView({
      status,
      uploading: false,
      onUploadNow: vi.fn(),
    });

    expect(
      buttons(card).some((node) => text(node).includes("إعادة الإرسال")),
    ).toBe(false);
  });
});