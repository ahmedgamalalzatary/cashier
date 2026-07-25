"use client";

import { useState, type FormEvent } from "react";
import type { Shift } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

export type ShiftActionMode =
  "open" | "close" | "admin-close" | "reopen" | "correction";

type Values = {
  openingFloat?: number;
  actualCash?: number;
  note?: string;
};

const titles: Record<ShiftActionMode, string> = {
  open: "فتح وردية",
  close: "إغلاق الوردية",
  "admin-close": "إغلاق إداري للوردية",
  reopen: "إعادة فتح الوردية",
  correction: "تصحيح الوردية",
};

export function ShiftActionModal({
  mode,
  shift,
  onClose,
  onSubmit,
}: {
  mode: ShiftActionMode;
  shift?: Shift;
  onClose: () => void;
  onSubmit: (values: Values) => Promise<void>;
}) {
  const [openingFloat, setOpeningFloat] = useState(
    mode === "correction" ? (shift?.openingFloat ?? "") : "",
  );
  const [actualCash, setActualCash] = useState(
    mode === "correction" ? (shift?.actualCash ?? "") : "",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (needsNote && !trimmedNote) {
      setError("ملاحظة التدقيق مطلوبة");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        ...(mode === "open" || mode === "correction"
          ? { openingFloat: Number(openingFloat) }
          : {}),
        ...(mode === "close" || mode === "admin-close" || mode === "correction"
          ? { actualCash: Number(actualCash) }
          : {}),
        ...(mode === "admin-close" || mode === "reopen" || mode === "correction"
          ? { note: trimmedNote }
          : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الإجراء");
    } finally {
      setSaving(false);
    }
  }

  const needsOpening = mode === "open" || mode === "correction";
  const needsActual =
    mode === "close" || mode === "admin-close" || mode === "correction";
  const needsNote =
    mode === "admin-close" || mode === "reopen" || mode === "correction";

  return (
    <Modal title={titles[mode]} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {shift && (
          <p className="rounded-lg bg-primary/5 p-3 text-sm text-muted">
            وردية <strong className="text-ink">{shift.cashierName}</strong> رقم{" "}
            <span className="tnum">#{shift.id}</span>
          </p>
        )}
        {needsOpening && (
          <Field
            label={
              mode === "open"
                ? "العهدة الافتتاحية المعدودة"
                : "العهدة الافتتاحية"
            }
            type="number"
            min="0"
            step="0.01"
            value={openingFloat}
            onChange={(event) => setOpeningFloat(event.target.value)}
            required
            autoFocus
            dir="ltr"
          />
        )}
        {needsActual && (
          <Field
            label="النقدية الفعلية المعدودة"
            type="number"
            min="0"
            step="0.01"
            value={actualCash}
            onChange={(event) => setActualCash(event.target.value)}
            required
            autoFocus={!needsOpening}
            dir="ltr"
          />
        )}
        {needsNote && (
          <TextAreaField
            label="ملاحظة التدقيق"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            required
            autoFocus={!needsOpening && !needsActual}
          />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            type="submit"
            variant={mode === "admin-close" ? "danger" : "primary"}
            disabled={saving}
          >
            {saving ? "جارِ التنفيذ…" : "تأكيد"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
