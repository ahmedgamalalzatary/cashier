"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { changePasswordAndRefreshSession } from "@/services/auth-service";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword"));
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirmPassword"))) {
      setError("تأكيد كلمة المرور غير مطابق");
      return;
    }
    setSaving(true);
    try {
      await changePasswordAndRefreshSession(currentPassword, newPassword);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تغيير كلمة المرور",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="تغيير كلمة المرور" open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field
          label="كلمة المرور الحالية"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          dir="ltr"
        />
        <Field
          label="كلمة المرور الجديدة"
          name="newPassword"
          type="password"
          minLength={8}
          maxLength={255}
          autoComplete="new-password"
          required
          dir="ltr"
        />
        <Field
          label="تأكيد كلمة المرور الجديدة"
          name="confirmPassword"
          type="password"
          minLength={8}
          maxLength={255}
          autoComplete="new-password"
          required
          dir="ltr"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "تغيير كلمة المرور"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
