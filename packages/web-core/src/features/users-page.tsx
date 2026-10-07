"use client";

import { useEffect, useState } from "react";
import { Ban, Pencil, Plus, Power } from "lucide-react";
import type { ManagedUser } from "@cashier/shared";
import { useAuth } from "../components/auth/auth-provider";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "../components/ui/data-table";
import { PageHeader } from "../components/ui/page-header";
import { EmptyState, ErrorBanner, LoadingState } from "../components/ui/states";
import { IconButton } from "../components/ui/icon-button";
import { UserModal } from "../components/users/user-modal";
import { listUsers, setUserActive } from "../services/users-service";

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState<ManagedUser | null>(null);
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [confirmingError, setConfirmingError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listUsers()
      .then((rows) => {
        if (cancelled) return;
        setUsers(rows);
        setError("");
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "تعذر تحميل المستخدمين",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function toggleActive(user: ManagedUser) {
    const action = user.isActive ? "إيقاف" : "إعادة تفعيل";
    setConfirmingBusy(true);
    setConfirmingError("");
    try {
      await setUserActive(user.id, !user.isActive);
      setConfirming(null);
      setReloadKey((current) => current + 1);
    } catch (cause) {
      setConfirmingError(
        cause instanceof Error ? cause.message : `تعذر ${action} الحساب`,
      );
    } finally {
      setConfirmingBusy(false);
    }
  }

  const columns: DataColumn<ManagedUser>[] = [
    {
      key: "name",
      header: "المستخدم",
      mobile: "primary",
      cell: (user) => (
        <span className="font-medium">
          {user.name}
          {user.id === currentUser?.id && (
            <span className="ms-2 text-xs font-normal text-muted">حسابك</span>
          )}
        </span>
      ),
    },
    {
      key: "username",
      header: "اسم الدخول",
      cell: (user) => (
        <span className="tnum" dir="ltr">
          {user.username}
        </span>
      ),
    },
    {
      key: "role",
      header: "الصلاحية",
      cell: (user) => (
        <span className="flex flex-wrap items-center gap-2">
          {user.role === "admin" ? "مدير نظام" : "كاشير"}
          {user.isSuperAdmin && <Badge tone="neutral">المدير الرئيسي</Badge>}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (user) => (
        <Badge tone={user.isActive ? "success" : "neutral"}>
          {user.isActive ? "نشط" : "موقوف"}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="مستخدمو النظام"
        description="إدارة حسابات النظام. أنشئ المديرين هنا، وامنح دخول الكاشير من شاشة الموظفين حتى تظل ووردياته وساعات عمله مرتبطة بسجله."
        actions={
          currentUser?.isSuperAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> مدير جديد
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {loading ? (
        <LoadingState label="جارِ تحميل المستخدمين…" />
      ) : (
        <DataTable
          caption="مستخدمو النظام"
          rows={users}
          rowKey={(user) => user.id}
          rowClassName={(user) => (user.isActive ? undefined : "opacity-55")}
          columns={columns}
          empty={
            <EmptyState
              icon={<Power className="size-8" />}
              title="لا توجد حسابات بعد"
              description="أنشئ أول حساب مستخدم."
            />
          }
          actions={(user) => {
            if (user.role !== "admin") {
              return (
                <span className="text-xs text-muted">يُدار من سجل الموظف</span>
              );
            }
            if (user.isSuperAdmin) {
              return (
                <span className="text-xs text-muted">
                  يُدار من إعدادات الخادم
                </span>
              );
            }
            if (!currentUser?.isSuperAdmin) {
              return <span className="text-xs text-muted">عرض فقط</span>;
            }
            return (
              <div className="flex items-center gap-1">
                <IconButton
                  title="تعديل الحساب أو كلمة المرور"
                  onClick={() => {
                    setEditing(user);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  title={user.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                  danger={user.isActive}
                  onClick={() => {
                    setConfirmingError("");
                    setConfirming(user);
                  }}
                >
                  {user.isActive ? (
                    <Ban className="size-4" />
                  ) : (
                    <Power className="size-4" />
                  )}
                </IconButton>
              </div>
            );
          }}
        />
      )}

      {formOpen && (
        <UserModal
          key={editing?.id ?? "new"}
          user={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setReloadKey((current) => current + 1);
          }}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.isActive ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}
        description={
          confirming
            ? `${confirming.isActive ? "سيُوقف" : "سيُعاد تفعيل"} حساب "${confirming.name}".`
            : undefined
        }
        tone={confirming?.isActive ? "danger" : "primary"}
        confirmLabel={confirming?.isActive ? "إيقاف" : "تفعيل"}
        busy={confirmingBusy}
        error={confirmingError}
        onConfirm={() => confirming && void toggleActive(confirming)}
        onCancel={() => {
          setConfirming(null);
          setConfirmingError("");
        }}
      />
    </div>
  );
}
