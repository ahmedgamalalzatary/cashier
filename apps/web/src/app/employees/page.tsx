"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, KeyRound, Pencil, Plus, Power, UserMinus } from "lucide-react";
import type { Employee } from "@cashier/shared";
import { CashierAccessModal } from "@/components/employees/cashier-access-modal";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import {
  deactivateEmployee,
  listEmployees,
  revokeCashierAccess,
  updateEmployee,
} from "@/services/employees-service";

const payTypeLabel = {
  monthly: "شهري",
  daily: "يومي",
  hourly: "بالساعة",
} as const;

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Employee | null | undefined>();
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);

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

  async function deactivate(employee: Employee) {
    if (!confirm(`إيقاف سجل الموظف "${employee.name}"؟`)) return;
    try {
      await deactivateEmployee(employee.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إيقاف الموظف");
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

  async function revoke(employee: Employee) {
    if (!confirm(`إلغاء دخول الكاشير للموظف "${employee.name}"؟`)) return;
    try {
      await revokeCashierAccess(employee.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر إلغاء صلاحية الكاشير",
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="الموظفون"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="size-4" /> موظف جديد
          </Button>
        }
      />
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted">
        سجلات الموظفين مستقلة عن الدخول للنظام. يمكن منح الموظف صلاحية كاشير
        واحدة، وتُحسب ساعات عمل الكاشير من وردياته.
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-muted">جارِ تحميل الموظفين…</p>
      ) : employees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد سجلات موظفين بعد.
        </p>
      ) : (
        <Table
          headers={[
            "الموظف",
            "الوظيفة",
            "الأجر",
            "دخول الكاشير",
            "الحالة",
            "إجراءات",
          ]}
        >
          {employees.map((employee) => (
            <tr
              key={employee.id}
              className={employee.isActive ? "" : "opacity-55"}
            >
              <td className="px-4 py-3">
                <div className="font-medium">{employee.name}</div>
                <div className="text-xs text-muted">
                  {employee.phone || "—"}
                </div>
              </td>
              <td className="px-4 py-3">{employee.jobTitle || "—"}</td>
              <td className="px-4 py-3">
                {employee.payType && employee.payRate
                  ? `${formatMoney(employee.payRate)} · ${payTypeLabel[employee.payType]}`
                  : "—"}
              </td>
              <td className="px-4 py-3">
                {employee.cashierAccess ? (
                  <div>
                    <Badge
                      tone={
                        employee.cashierAccess.isActive ? "success" : "neutral"
                      }
                    >
                      {employee.cashierAccess.isActive ? "مفعّل" : "موقوف"}
                    </Badge>
                    <div className="mt-1 text-xs tnum" dir="ltr">
                      {employee.cashierAccess.username}
                    </div>
                  </div>
                ) : (
                  <Badge tone="neutral">بدون دخول</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={employee.isActive ? "success" : "neutral"}>
                  {employee.isActive ? "نشط" : "موقوف"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <IconButton
                    title="تعديل الموظف"
                    onClick={() => setEditing(employee)}
                  >
                    <Pencil className="size-4" />
                  </IconButton>
                  {employee.isActive &&
                    (!employee.cashierAccess ||
                    !employee.cashierAccess.isActive ? (
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
                        onClick={() => revoke(employee)}
                      >
                        <UserMinus className="size-4" />
                      </IconButton>
                    ))}
                  {employee.isActive ? (
                    <IconButton
                      title="إيقاف الموظف"
                      danger
                      onClick={() => deactivate(employee)}
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
              </td>
            </tr>
          ))}
        </Table>
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
    </div>
  );
}
