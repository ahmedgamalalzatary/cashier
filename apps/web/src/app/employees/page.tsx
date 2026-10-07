"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, KeyRound, Lock, Pencil, Plus, Power, UserMinus } from "lucide-react";
import type { Employee } from "@cashier/shared";
import { CashierAccessModal } from "@/components/employees/cashier-access-modal";
import { CashierPasswordModal } from "@/components/employees/cashier-password-modal";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import {
  deactivateEmployee,
  listEmployees,
  revokeCashierAccess,
  updateEmployee,
} from "@/services/employees-service";

type ConfirmAction = { kind: "deactivate" | "revoke"; employee: Employee };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Employee | null | undefined>();
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);
  const [passwordEmployee, setPasswordEmployee] = useState<Employee | null>(
    null,
  );
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [confirmingError, setConfirmingError] = useState("");

  const load = useCallback(async () => {
    try {
      setEmployees(await listEmployees());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الموظفين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  async function runConfirm() {
    if (!confirming) return;
    setConfirmingBusy(true);
    setConfirmingError("");
    try {
      if (confirming.kind === "deactivate")
        await deactivateEmployee(confirming.employee.id);
      else await revokeCashierAccess(confirming.employee.id);
      setConfirming(null);
      await load();
    } catch (cause) {
      setConfirmingError(
        cause instanceof Error ? cause.message : "تعذر تنفيذ الإجراء",
      );
    } finally {
      setConfirmingBusy(false);
    }
  }

  async function reactivate(employee: Employee) {
    try {
      await updateEmployee(employee.id, { isActive: true });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تفعيل الموظف");
    }
  }

  const columns: DataColumn<Employee>[] = [
    {
      key: "name",
      header: "الموظف",
      mobile: "primary",
      cell: (employee) => (
        <div>
          <div className="font-medium">{employee.name}</div>
          <div className="tnum text-xs text-muted">
            {employee.phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "job",
      header: "الوظيفة",
      cell: (employee) => employee.jobTitle || "—",
    },
    {
      key: "pay",
      header: "الراتب الشهري",
      cell: (employee) =>
        employee.payRate ? formatMoney(employee.payRate) : "لم يُحدَّد بعد",
    },
    {
      key: "access",
      header: "دخول الكاشير",
      cell: (employee) =>
        employee.cashierAccess ? (
          <div>
            <Badge
              tone={employee.cashierAccess.isActive ? "success" : "neutral"}
            >
              {employee.cashierAccess.isActive ? "مفعّل" : "موقوف"}
            </Badge>
            <div className="tnum mt-1 text-xs" dir="ltr">
              {employee.cashierAccess.username}
            </div>
          </div>
        ) : (
          <Badge tone="neutral">بدون دخول</Badge>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (employee) => (
        <Badge tone={employee.isActive ? "success" : "neutral"}>
          {employee.isActive ? "نشط" : "موقوف"}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الموظفون"
        description="سجلات الموظفين مستقلة عن الدخول للنظام. يمكن منح الموظف صلاحية كاشير واحدة، وتُحسب ساعات عمل الكاشير من ووردياته."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="size-4" /> موظف جديد
          </Button>
        }
      />
      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
      {loading ? (
        <LoadingState label="جارِ تحميل الموظفين…" />
      ) : (
        <DataTable
          caption="قائمة الموظفين"
          rows={employees}
          rowKey={(employee) => employee.id}
          rowClassName={(employee) =>
            employee.isActive ? undefined : "opacity-55"
          }
          columns={columns}
          empty={
            <EmptyState
              icon={<Power className="size-8" />}
              title="لا توجد سجلات موظفين بعد"
              description="أضف أول موظف لربط وورديات الكاشير وساعات العمل."
            />
          }
          actions={(employee) => (
            <div className="flex items-center gap-1">
              <IconButton
                title="تعديل الموظف"
                onClick={() => setEditing(employee)}
              >
                <Pencil className="size-4" />
              </IconButton>
              {employee.isActive &&
                (!employee.cashierAccess || !employee.cashierAccess.isActive ? (
                  <IconButton
                    title={
                      employee.cashierAccess
                        ? "إعادة تفعيل حساب الكاشير"
                        : "منح صلاحية كاشير"
                    }
                    onClick={() => setAccessEmployee(employee)}
                  >
                    <KeyRound className="size-4" />
                  </IconButton>
                ) : (
                  <IconButton
                    title="إلغاء صلاحية الكاشير"
                    danger
                    onClick={() => {
                      setConfirmingError("");
                      setConfirming({ kind: "revoke", employee });
                    }}
                  >
                    <UserMinus className="size-4" />
                  </IconButton>
                ))}
              {employee.isActive && employee.cashierAccess?.isActive && (
                <IconButton
                  title="إعادة تعيين كلمة المرور"
                  onClick={() => setPasswordEmployee(employee)}
                >
                  <Lock className="size-4" />
                </IconButton>
              )}
              {employee.isActive ? (
                <IconButton
                  title="إيقاف الموظف"
                  danger
                  onClick={() => {
                    setConfirmingError("");
                    setConfirming({ kind: "deactivate", employee });
                  }}
                >
                  <Ban className="size-4" />
                </IconButton>
              ) : (
                <IconButton
                  title="إعادة تفعيل الموظف"
                  onClick={() => reactivate(employee)}
                >
                  <Power className="size-4" />
                </IconButton>
              )}
            </div>
          )}
        />
      )}
      {editing !== undefined && (
        <EmployeeModal
          employee={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {accessEmployee && (
        <CashierAccessModal
          employee={accessEmployee}
          onClose={() => setAccessEmployee(null)}
          onSaved={() => {
            setAccessEmployee(null);
            void load();
          }}
        />
      )}
      {passwordEmployee && (
        <CashierPasswordModal
          employee={passwordEmployee}
          onClose={() => setPasswordEmployee(null)}
          onSaved={() => {
            setPasswordEmployee(null);
            void load();
          }}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === "revoke"
            ? "إلغاء صلاحية الكاشير"
            : "إيقاف الموظف"
        }
        description={
          confirming
            ? confirming.kind === "revoke"
              ? `سيُلغى دخول الكاشير للموظف "${confirming.employee.name}".`
              : `سيُوقف سجل الموظف "${confirming.employee.name}" مع بقاء سجلاته.`
            : undefined
        }
        tone="danger"
        confirmLabel={confirming?.kind === "revoke" ? "إلغاء الصلاحية" : "إيقاف"}
        busy={confirmingBusy}
        error={confirmingError}
        onConfirm={() => void runConfirm()}
        onCancel={() => {
          setConfirming(null);
          setConfirmingError("");
        }}
      />
    </div>
  );
}
