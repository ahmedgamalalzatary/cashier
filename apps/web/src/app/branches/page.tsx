"use client";

import { useState, type FormEvent } from "react";
import {
  Archive,
  Building2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { Branch } from "@cashier/shared";
import { useBranch } from "@/components/branches/branch-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import {
  archiveBranch,
  createBranch,
  updateBranch,
} from "@/services/branches-service";

export default function BranchesPage() {
  const { branch, branches, selectBranch, refresh } = useBranch();
  const [form, setForm] = useState<{ id?: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الفرع");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form?.name.trim()) {
      setError("أدخل اسم الفرع");
      return;
    }
    await run(async () => {
      if (form.id !== undefined)
        await updateBranch(form.id, { name: form.name.trim() });
      else await createBranch(form.name.trim());
      setForm(null);
    });
  }
  function archive(row: Branch) {
    if (window.confirm(`أرشفة «${row.name}»؟ ستظل سجلاته محفوظة.`))
      void run(() => archiveBranch(row.id));
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="الفروع"
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(async () => undefined)}
            >
              <RefreshCw className="size-4" />
              تحديث
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setError("");
                setForm({ name: "" });
              }}
            >
              <Plus className="size-4" />
              إضافة فرع
            </Button>
          </div>
        }
      />
      <p className="max-w-2xl text-sm leading-7 text-muted">
        لكل فرع مخزونه وموظفوه وسجلاته الخاصة. افتح الفرع الذي تريد العمل فيه،
        وأنشئ حسابات الكاشير من سجل الموظفين داخله.
      </p>
      {error && !form && (
        <p
          role="alert"
          className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <Table headers={["الفرع", "الحالة", "الإجراءات"]}>
        {branches.map((row) => (
          <tr key={row.id}>
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                <Building2 className="size-5 text-primary" />
                <span className="font-semibold">{row.name}</span>
                {row.id === branch.id && (
                  <Badge tone="neutral">الفرع الحالي</Badge>
                )}
              </div>
            </td>
            <td className="px-4 py-4">
              <Badge tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? "نشط" : "مؤرشف"}
              </Badge>
            </td>
            <td className="px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  disabled={busy || row.id === branch.id}
                  onClick={() => selectBranch(row.id)}
                >
                  فتح الفرع
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setForm({ id: row.id, name: row.name });
                  }}
                >
                  <Pencil className="size-4" />
                  تعديل
                </Button>
                {row.isActive ? (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => archive(row)}
                  >
                    <Archive className="size-4" />
                    أرشفة
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(() => updateBranch(row.id, { isActive: true }))
                    }
                  >
                    <RotateCcw className="size-4" />
                    إعادة تفعيل
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {form && (
        <Modal
          open
          title={form.id === undefined ? "إضافة فرع" : "تعديل الفرع"}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form onSubmit={submit} className="space-y-5">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Field
              label="اسم الفرع"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              maxLength={191}
              autoFocus
              disabled={busy}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "جارٍ الحفظ…" : "حفظ الفرع"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
