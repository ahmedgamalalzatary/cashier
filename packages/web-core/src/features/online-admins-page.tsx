"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, ShieldCheck, UserCheck } from "lucide-react";
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
  createAdmin,
  listAdmins,
  updateAdmin,
  type AdminAccount,
} from "../services/admins-service";

type FormState = {
  id?: string;
  name: string;
  username: string;
  password: string;
  branchIds: string[];
  /** Archived branches this admin already reads; only these stay on offer. */
  keptArchived: string[];
};

/**
 * Admin accounts for the online site (plan Phase 8.2). The super-admin owns
 * every account; the accounts themselves come from the server settings and are
 * never editable here.
 */
export function OnlineAdminsPage() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [deactivating, setDeactivating] = useState<AdminAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    void listAdmins()
      .then(setAccounts)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "تعذر تحميل المديرين",
        ),
      );
  }, [user?.isSuperAdmin]);

  if (!user?.isSuperAdmin)
    return <ErrorBanner>لا تملك صلاحية إدارة المديرين</ErrorBanner>;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setAccounts(await listAdmins());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ المدير");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (!form.name.trim() || !form.username.trim()) {
      setError("أدخل الاسم واسم المستخدم");
      return;
    }
    if (form.id === undefined && form.password.length < 8) {
      setError("كلمة المرور 8 أحرف على الأقل");
      return;
    }
    await run(async () => {
      if (form.id === undefined)
        await createAdmin({
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password,
          branchIds: form.branchIds,
        });
      else {
        // One request: a refused branch leaves the details unsaved too.
        await updateAdmin(form.id, {
          name: form.name.trim(),
          username: form.username.trim(),
          ...(form.password ? { password: form.password } : {}),
          branchIds: form.branchIds,
        });
      }
      setForm(null);
    });
  }

  function toggleBranch(branchId: string, checked: boolean) {
    setForm((current) =>
      current
        ? {
            ...current,
            branchIds: checked
              ? [...current.branchIds, branchId]
              : current.branchIds.filter((id) => id !== branchId),
          }
        : current,
    );
  }

  const branchNames = (ids: string[]) =>
    ids
      .map((id) => branches.find((branch) => branch.id === id)?.name)
      .filter(Boolean)
      .join("، ");

  const columns: DataColumn<AdminAccount>[] = [
    {
      key: "account",
      header: "المدير",
      mobile: "primary",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{row.name}</span>
          <span className="text-sm text-muted">{row.username}</span>
        </div>
      ),
    },
    {
      key: "branches",
      header: "الفروع",
      cell: (row) =>
        row.isSuperAdmin ? (
          <span className="text-sm text-muted">كل الفروع</span>
        ) : (
          <span>{branchNames(row.branchIds) || "—"}</span>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) =>
        row.isSuperAdmin ? (
          <Badge tone="neutral">
            <ShieldCheck className="size-4" />
            من إعدادات الخادم
          </Badge>
        ) : (
          <Badge tone={row.isActive ? "success" : "neutral"}>
            {row.isActive ? "نشط" : "موقوف"}
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة المديرين"
        description="أنشئ حسابات المديرين وحدّد الفروع التي يطّلعون على تقاريرها. إيقاف الحساب ينهي جلساته فورًا."
        actions={
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setForm({
                name: "",
                username: "",
                password: "",
                branchIds: [],
                keptArchived: [],
              });
            }}
          >
            <Plus className="size-4" />
            إضافة مدير
          </Button>
        }
      />
      {error && !form && <ErrorBanner>{error}</ErrorBanner>}
      <DataTable
        caption="قائمة المديرين"
        rows={accounts}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) =>
          // The super-admin's own account lives in the server settings.
          row.isSuperAdmin ? null : (
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setForm({
                    id: row.id,
                    name: row.name,
                    username: row.username,
                    password: "",
                    branchIds: row.branchIds,
                    keptArchived: row.branchIds.filter((id) =>
                      branches.some(
                        (branch) => branch.id === id && !branch.isActive,
                      ),
                    ),
                  });
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
                    setDeactivating(row);
                  }}
                >
                  <UserCheck className="size-4" />
                  إيقاف
                </Button>
              )}
              {!row.isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => updateAdmin(row.id, { isActive: true }))
                  }
                >
                  <UserCheck className="size-4" />
                  تفعيل
                </Button>
              )}
            </div>
          )
        }
      />
      {form && (
        <Modal
          open
          title={form.id === undefined ? "إضافة مدير" : "تعديل المدير"}
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
              label="الاسم"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              maxLength={191}
              autoFocus
              disabled={busy}
            />
            <Field
              label="اسم المستخدم"
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
              required
              maxLength={100}
              disabled={busy}
            />
            <Field
              label={
                form.id === undefined
                  ? "كلمة المرور"
                  : "كلمة مرور جديدة (اتركها فارغة للإبقاء)"
              }
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              required={form.id === undefined}
              minLength={8}
              disabled={busy}
            />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                الفروع المسموح بها
              </legend>
              {branches
                .filter(
                  (branch) =>
                    branch.isActive || form.keptArchived.includes(branch.id),
                )
                .map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.branchIds.includes(branch.id)}
                      disabled={busy}
                      onChange={(event) =>
                        toggleBranch(branch.id, event.target.checked)
                      }
                    />
                    {`${branch.name}${branch.isActive ? "" : " (مؤرشف)"}`}
                  </label>
                ))}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "جارٍ الحفظ…" : "حفظ"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <ConfirmDialog
        open={deactivating !== null}
        title="إيقاف الحساب"
        description={
          deactivating
            ? `سيتوقف «${deactivating.name}» عن العمل فورًا وينتهي جلسته الحالية.`
            : undefined
        }
        tone="danger"
        confirmLabel="إيقاف"
        busy={busy}
        onConfirm={() => {
          if (deactivating)
            void run(async () => {
              await updateAdmin(deactivating.id, { isActive: false });
              setDeactivating(null);
            });
        }}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}
