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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorBanner } from "@/components/ui/states";
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
  const [archiving, setArchiving] = useState<Branch | null>(null);
  const [archivingError, setArchivingError] = useState("");

  async function archive(target: Branch) {
    setBusy(true);
    setArchivingError("");
    try {
      await archiveBranch(target.id);
    } catch (cause) {
      setArchivingError(
        cause instanceof Error ? cause.message : "تعذر أرشفة الفرع",
      );
      setBusy(false);
      return;
    }
    // archived: the dialog closes, so a failed refresh is a page-level error
    setArchiving(null);
    try {
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تمت الأرشفة، لكن تعذر تحديث الفروع",
      );
    } finally {
      setBusy(false);
    }
  }

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

  const columns: DataColumn<Branch>[] = [
    {
      key: "name",
      header: "الفرع",
      mobile: "primary",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Building2 className="size-5 text-primary" />
          <span className="font-semibold">{row.name}</span>
          {row.id === branch.id && <Badge tone="neutral">الفرع الحالي</Badge>}
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => (
        <Badge tone={row.isActive ? "success" : "neutral"}>
          {row.isActive ? "نشط" : "مؤرشف"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الفروع"
        description="لكل فرع مخزونه وموظفوه وسجلاته الخاصة. افتح الفرع الذي تريد العمل فيه، وأنشئ حسابات الكاشير من سجل الموظفين داخله."
        actions={
          <>
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
          </>
        }
      />
      {error && !form && <ErrorBanner>{error}</ErrorBanner>}
      <DataTable
        caption="قائمة الفروع"
        rows={branches}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || row.id === branch.id}
              onClick={() => selectBranch(row.id)}
            >
              فتح الفرع
            </Button>
            <Button
              variant="ghost"
              size="sm"
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
                size="sm"
                disabled={busy}
                onClick={() => {
                  setArchivingError("");
                  setArchiving(row);
                }}
              >
                <Archive className="size-4" />
                أرشفة
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
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
        )}
      />
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
      <ConfirmDialog
        open={archiving !== null}
        title="أرشفة الفرع"
        description={
          archiving
            ? `ستُؤرشف «${archiving.name}» مع بقاء سجلاته محفوظة.`
            : undefined
        }
        tone="danger"
        confirmLabel="أرشفة"
        busy={busy}
        error={archivingError}
        onConfirm={() => {
          if (archiving) void archive(archiving);
        }}
        onCancel={() => {
          setArchiving(null);
          setArchivingError("");
        }}
      />
    </div>
  );
}
