"use client";

import { useState, type FormEvent } from "react";
import type { Employee } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { grantCashierAccess } from "@/services/employees-service";

export function CashierAccessModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(
    employee.cashierAccess?.username ?? "",
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const restoring = Boolean(employee.cashierAccess);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await grantCashierAccess(employee.id, {
        username: username.trim(),
        password,
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ صلاحية الكاشير",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={restoring ? "إعادة تفعيل حساب الكاشير" : "منح صلاحية كاشير"}
      open
      onClose={onClose}
    >
      <form onSubmit={save} className="space-y-4">
        <p className="rounded-lg bg-primary/5 p-3 text-sm text-muted">
          الموظف: <strong className="text-ink">{employee.name}</strong>
        </p>
        <Field
          label="اسم المستخدم"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={100}
          required
          autoFocus
          dir="ltr"
          autoComplete="off"
        />
        <Field
          label={restoring ? "كلمة مرور جديدة" : "كلمة المرور"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={8}
          maxLength={255}
          required
          dir="ltr"
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "جارِ الحفظ…"
              : restoring
                ? "إعادة التفعيل"
                : "منح الصلاحية"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
