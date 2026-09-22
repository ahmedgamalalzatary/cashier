"use client";

import { useState, type FormEvent } from "react";
import type { Employee, EmployeePayType } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  createEmployee,
  employeePayPayload,
  updateEmployee,
  type EmployeeSaveBody,
} from "@/services/employees-service";

export function EmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(employee?.jobTitle ?? "");
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? "");
  const [payType, setPayType] = useState<EmployeePayType | "">(
    employee?.payType ?? "",
  );
  const [payRate, setPayRate] = useState(employee?.payRate ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body: EmployeeSaveBody = {
      name: name.trim(),
      phone: phone.trim() || null,
      jobTitle: jobTitle.trim() || null,
      hireDate: hireDate || null,
      ...employeePayPayload(payType, payRate),
      notes: notes.trim() || null,
    };
    try {
      if (employee) await updateEmployee(employee.id, body);
      else await createEmployee(body);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ بيانات الموظف",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={employee ? "تعديل بيانات الموظف" : "موظف جديد"}
      open
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="اسم الموظف"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={191}
            required
            autoFocus
          />
          <Field
            label="رقم الهاتف"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={50}
            dir="ltr"
          />
          <Field
            label="المسمى الوظيفي"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            maxLength={100}
          />
          <Field
            label="تاريخ التعيين"
            type="date"
            value={hireDate}
            onChange={(event) => setHireDate(event.target.value)}
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">نوع الأجر</span>
            <select
              value={payType}
              onChange={(event) =>
                setPayType(event.target.value as EmployeePayType | "")
              }
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">غير محدد</option>
              <option value="monthly">شهري</option>
              {employee?.payType === "daily" && (
                <option value="daily" disabled>
                  يومي (قديم — غيّره إلى شهري)
                </option>
              )}
              {employee?.payType === "hourly" && (
                <option value="hourly" disabled>
                  بالساعة (قديم — غيّره إلى شهري)
                </option>
              )}
            </select>
          </label>
          {(payType === "daily" || payType === "hourly") && (
            <p className="self-end text-sm leading-6 text-warning">
              نوع الأجر القديم سيُمسح عند الحفظ. اختر «شهري» وأدخل الراتب الشهري
              للاحتفاظ ببيانات الراتب.
            </p>
          )}
          <Field
            label="الراتب الشهري"
            type="number"
            min="0"
            step="0.01"
            value={payRate}
            onChange={(event) => setPayRate(event.target.value)}
            required={payType === "monthly"}
            disabled={payType !== "monthly"}
            dir="ltr"
          />
        </div>
        <TextAreaField
          label="ملاحظات"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ الموظف"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
