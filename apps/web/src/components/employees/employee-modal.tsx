"use client";

import { useState, type FormEvent } from "react";
import type { Employee, EmployeePayType } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  createEmployee,
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
      payType: payType || null,
      payRate: payType && payRate !== "" ? Number(payRate) : null,
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
              <option value="daily">يومي</option>
              <option value="hourly">بالساعة</option>
            </select>
          </label>
          <Field
            label="قيمة الأجر"
            type="number"
            min="0"
            step="0.01"
            value={payRate}
            onChange={(event) => setPayRate(event.target.value)}
            required={Boolean(payType)}
            disabled={!payType}
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
