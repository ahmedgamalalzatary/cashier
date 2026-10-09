"use client";

import { useState, type FormEvent } from "react";
import type { Employee } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Field } from "@cashier/web-core/components/ui/field";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { passwordTooLongMessage } from "@cashier/web-core/lib/password";
import { resetCashierPassword } from "@/services/employees-service";

export function CashierPasswordModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const tooLong = passwordTooLongMessage(password);
    if (tooLong) {
      setError(tooLong);
      setSaving(false);
      return;
    }
    try {
      await resetCashierPassword(employee.id, password);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تعيين كلمة المرور",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="إعادة تعيين كلمة المرور" open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="rounded-lg bg-primary/5 p-3 text-sm text-muted">
          الموظف: <strong className="text-ink">{employee.name}</strong>
          {employee.cashierAccess && (
            <>
              {" · "}
              <span className="tnum" dir="ltr">
                {employee.cashierAccess.username}
              </span>
            </>
          )}
        </p>
        <p className="text-sm text-muted">
          سيُنهي هذا الجلسات المفتوحة لهذا الحساب.
        </p>
        <Field
          label="كلمة المرور الجديدة"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={8}
          maxLength={255}
          required
          autoFocus
          dir="ltr"
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "تعيين كلمة المرور"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
