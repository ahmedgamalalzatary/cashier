"use client";

import { useState, type FormEvent } from "react";
import type { Employee } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Field, TextAreaField } from "@cashier/web-core/components/ui/field";
import { Modal } from "@cashier/web-core/components/ui/modal";
import {
  createEmployee,
  employeeSalaryPayload,
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
      ...employeeSalaryPayload(payRate),
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
          <Field
            label="الراتب الشهري"
            type="number"
            min="0"
            step="0.01"
            value={payRate}
            onChange={(event) => setPayRate(event.target.value)}
            placeholder="لم يُحدَّد بعد"
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
