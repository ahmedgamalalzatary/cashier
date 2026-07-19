"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Ban, Pencil, Plus, Power } from "lucide-react";
import type { ManagedUser } from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { api } from "@/lib/api";
import { UserModal } from "./user-modal";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<ManagedUser[]>("/api/users")
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

  async function setActive(user: ManagedUser, isActive: boolean) {
    const action = isActive ? "إعادة تفعيل" : "إيقاف";
    if (!confirm(`${action} حساب "${user.name}"؟`)) return;
    try {
      await api(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      });
      setReloadKey((current) => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `تعذر ${action} الحساب`,
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="مستخدمو النظام"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> مستخدم جديد
          </Button>
        }
      />

      <p className="mb-5 max-w-2xl text-sm leading-6 text-muted">
        أنشئ حساباً مستقلاً لكل كاشير، وحدد صلاحياته، وأوقف الحساب فور انتهاء
        عمله.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-muted">جارِ تحميل المستخدمين…</p>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد حسابات بعد — أنشئ أول حساب مستخدم.
        </p>
      ) : (
        <Table
          headers={["المستخدم", "اسم الدخول", "الصلاحية", "الحالة", "إجراءات"]}
        >
          {users.map((user) => (
            <tr key={user.id} className={user.isActive ? "" : "opacity-50"}>
              <td className="px-4 py-3 font-medium">
                {user.name}
                {user.id === currentUser?.id && (
                  <span className="ms-2 text-xs font-normal text-muted">
                    حسابك
                  </span>
                )}
              </td>
              <td className="px-4 py-3 tnum" dir="ltr">
                {user.username}
              </td>
              <td className="px-4 py-3">
                {user.role === "admin" ? "مدير نظام" : "كاشير"}
              </td>
              <td className="px-4 py-3">
                <Badge tone={user.isActive ? "success" : "neutral"}>
                  {user.isActive ? "نشط" : "موقوف"}
                </Badge>
              </td>
              <td className="px-4 py-3">
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
                  {user.id !== currentUser?.id && (
                    <IconButton
                      title={user.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                      danger={user.isActive}
                      onClick={() => setActive(user, !user.isActive)}
                    >
                      {user.isActive ? (
                        <Ban className="size-4" />
                      ) : (
                        <Power className="size-4" />
                      )}
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
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
    </div>
  );
}

function IconButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
