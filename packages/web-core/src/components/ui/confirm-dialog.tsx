"use client";

import { Modal } from "./modal";
import { Button } from "./button";
import { ErrorBanner } from "./states";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  tone = "primary",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {description && (
        <p className="text-sm leading-6 text-muted">{description}</p>
      )}
      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "جارٍ التنفيذ…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
