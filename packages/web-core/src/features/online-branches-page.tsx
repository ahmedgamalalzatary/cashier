"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { Branch, DeviceStatus } from "@cashier/shared";
import { useAuth } from "../components/auth/auth-provider";
import { useBranch } from "../components/branches/branch-provider";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "../components/ui/data-table";
import { Field } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { PageHeader } from "../components/ui/page-header";
import { ErrorBanner } from "../components/ui/states";
import {
  archiveBranch,
  createBranch,
  updateBranch,
} from "../services/branches-service";
import { listDeviceStatus } from "../services/devices-service";
import { cairoCalendarDate, cairoClock } from "../lib/cairo-date";
import { versionsInUse } from "../models/device-versions";

const when = (value: string | null) =>
  value
    ? `${cairoCalendarDate(new Date(value))} ${cairoClock(new Date(value))}`
    : "—";

/**
 * Branch management for the online site (plan Phase 8.1). The super-admin owns
 * every branch; an ordinary admin never sees these controls because the API
 * refuses the write anyway.
 */
export function OnlineBranchesPage() {
  const { user } = useAuth();
  const { branches, refresh } = useBranch();
  const [form, setForm] = useState<{ id?: string; name: string } | null>(null);
  const [archiving, setArchiving] = useState<Branch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which desktop version each branch's PC runs, so old versions can be retired.
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus[]>([]);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const loadDevices = useCallback(async () => {
    try {
      setDeviceStatus(await listDeviceStatus());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تحميل حالة الأجهزة",
      );
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    // The first read runs in an event-free async task, like the backup card's.
    const timer = setTimeout(() => void loadDevices(), 0);
    return () => clearTimeout(timer);
  }, [isSuperAdmin, loadDevices]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      await loadDevices();
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

  async function archive(target: Branch) {
    setBusy(true);
    setError("");
    try {
      await archiveBranch(target.id);
      setArchiving(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر أرشفة الفرع");
    } finally {
      setBusy(false);
    }
  }

  if (!user?.isSuperAdmin)
    return <ErrorBanner>لا تملك صلاحية إدارة الفروع</ErrorBanner>;

  const deviceOf = (branch: Branch) =>
    deviceStatus.find((device) => device.branchId === branch.id);
  const inUse = versionsInUse(deviceStatus);
  const columns: DataColumn<Branch>[] = [
    {
      key: "name",
      header: "الفرع",
      mobile: "primary",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Building2 className="size-5 text-primary" />
          <span className="font-semibold">{row.name}</span>
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
    {
      key: "version",
      header: "إصدار البرنامج",
      cell: (row) => {
        const device = deviceOf(row);
        if (!device) return <span className="text-muted">غير مرتبط</span>;
        return device.appVersion ?? (
          <span className="text-muted">لم يتصل بعد</span>
        );
      },
    },
    {
      key: "lastSeen",
      header: "آخر اتصال",
      cell: (row) => when(deviceOf(row)?.lastSeenAt ?? null),
    },
    {
      key: "lastUpload",
      header: "آخر نسخة احتياطية",
      cell: (row) => when(deviceOf(row)?.lastUploadAt ?? null),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة الفروع"
        description="أنشئ فروعًا جديدة، أعد تسميتها، أو أرشفها. سجلات الفرع تبقى محفوظة بعد الأرشفة ويمكن إعادة فتحه لاحقًا."
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
      {inUse.length > 0 && (
        <p className="text-sm text-muted">
          الإصدارات المستخدمة الآن:{" "}
          {inUse
            .map(
              ({ version, branches: count }) =>
                `${version ?? "لم يتصل بعد"} (${count} فرع)`,
            )
            .join("، ")}
        </p>
      )}
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
              disabled={busy}
              onClick={() => {
                setError("");
                setForm({ id: row.id, name: row.name });
              }}
            >
              <Pencil className="size-4" />
              تعديل
            </Button>
            {row.isActive && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setArchiving(row);
                }}
              >
                <Archive className="size-4" />
                أرشفة
              </Button>
            )}
            {!row.isActive && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => updateBranch(row.id, { isActive: true }))
                }
              >
                <ArchiveRestore className="size-4" />
                إعادة فتح
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
        onConfirm={() => {
          if (archiving) void archive(archiving);
        }}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}