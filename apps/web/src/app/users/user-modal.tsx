"use client";

import { useState, type FormEvent } from "react";
import type { ManagedUser } from "@cashier/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { userRequestBody, type UserFormState } from "./user-model";

export function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<UserFormState>({
    name: user?.name ?? "",
    username: user?.username ?? "",
    role: user?.role ?? "cashier",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set =
    (key: keyof UserFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(user ? `/api/users/${user.id}` : "/api/users", {
        method: user ? "PUT" : "POST",
        body: JSON.stringify(userRequestBody(form, Boolean(user))),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ المستخدم");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={user ? "تعديل حساب المستخدم" : "حساب مستخدم جديد"}
      open
      onClose={onClose}
    >
      <form onSubmit={save} className="space-y-4">
        <Field
          label="الاسم الظاهر"
          value={form.name}
          onChange={set("name")}
          maxLength={191}
          required
          autoFocus
        />
        <Field
          label="اسم المستخدم"
          value={form.username}
          onChange={set("username")}
          maxLength={100}
          autoComplete="off"
          required
          dir="ltr"
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">الصلاحية</span>
          <select
            value={form.role}
            onChange={set("role")}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="cashier">كاشير</option>
            <option value="admin">مدير نظام</option>
          </select>
        </label>
        <Field
          label={user ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}
          value={form.password}
          onChange={set("password")}
          type="password"
          minLength={8}
          maxLength={255}
          required={!user}
          autoComplete="new-password"
          dir="ltr"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ الحساب"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
