"use client";
import { useCallback, useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import type { SalaryMonth } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { cairoCalendarDate } from "@/lib/cairo-date";
import { formatMoney } from "@/lib/format";
import {
  createSalaryAdjustment,
  createSalaryAdvance,
  getSalaryMonth,
  paySalary,
} from "@/services/salaries-service";

const initialMonth = cairoCalendarDate().slice(0, 7);
export default function SalariesPage() {
  const [month, setMonth] = useState(initialMonth),
    [data, setData] = useState<SalaryMonth | null>(null);
  const [employeeId, setEmployeeId] = useState(""),
    [kind, setKind] = useState<"advance" | "bonus" | "deduction">("advance");
  const [amount, setAmount] = useState(""),
    [entryDate, setEntryDate] = useState(cairoCalendarDate),
    [note, setNote] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSalaryMonth(month));
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);
  async function addEntry() {
    setSaving(true);
    setError("");
    try {
      const body = {
        employeeId: Number(employeeId),
        amount: Number(amount),
        entryDate,
        note: note.trim() || null,
      };
      if (kind === "advance") await createSalaryAdvance(body);
      else await createSalaryAdjustment({ ...body, type: kind });
      setAmount("");
      setNote("");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function pay(id: number, name: string) {
    if (
      !confirm(
        `تأكيد صرف راتب ${name} عن ${month}؟ لا يمكن تعديل الدفعة بعد ذلك.`,
      )
    )
      return;
    setSaving(true);
    try {
      await paySalary(id, month);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="المرتبات والسلف"
        actions={
          <label className="flex items-center gap-2 text-sm">
            شهر الاستحقاق
            <input
              aria-label="شهر الاستحقاق"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setEntryDate(`${e.target.value}-01`);
              }}
              className="h-10 rounded-xl border border-line bg-paper px-3"
            />
          </label>
        }
      />
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-4 font-bold">تسجيل سلفة أو تسوية</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <select
            aria-label="الموظف"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-11 rounded-xl border border-line bg-paper px-3"
          >
            <option value="">اختر الموظف</option>
            {data?.employees.map((e) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.employeeName}
              </option>
            ))}
          </select>
          <select
            aria-label="النوع"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-11 rounded-xl border border-line bg-paper px-3"
          >
            <option value="advance">سلفة</option>
            <option value="bonus">مكافأة</option>
            <option value="deduction">خصم</option>
          </select>
          <input
            aria-label="المبلغ"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="المبلغ"
            className="h-11 rounded-xl border border-line bg-paper px-3 tnum"
          />
          <input
            aria-label="التاريخ"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="h-11 rounded-xl border border-line bg-paper px-3"
          />
          <input
            aria-label="ملاحظات"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظات"
            className="h-11 rounded-xl border border-line bg-paper px-3"
          />
        </div>
        <Button
          className="mt-4"
          onClick={addEntry}
          disabled={saving || !employeeId || Number(amount) <= 0}
        >
          <Plus className="size-4" />
          تسجيل
        </Button>
      </section>
      <section>
        <h2 className="mb-3 font-bold">كشف رواتب الشهر</h2>
        {loading ? (
          <p className="text-muted">جارِ التحميل…</p>
        ) : (
          <Table
            headers={[
              "الموظف",
              "الراتب",
              "المكافآت",
              "الخصومات",
              "السلف",
              "الصافي",
              "الحالة",
            ]}
          >
            {data?.employees.map((e) => (
              <tr key={e.employeeId} className={e.isActive ? "" : "opacity-60"}>
                <td>{e.employeeName}</td>
                <td className="tnum">
                  {e.basePay === null
                    ? "يلزم راتب شهري"
                    : formatMoney(e.basePay)}
                </td>
                <td className="tnum">{formatMoney(e.bonuses)}</td>
                <td className="tnum">{formatMoney(e.deductions)}</td>
                <td className="tnum">{formatMoney(e.advances)}</td>
                <td className="tnum font-bold">
                  {e.netPay === null ? "—" : formatMoney(e.netPay)}
                </td>
                <td>
                  {e.payment ? (
                    <span className="text-success">تم الصرف</span>
                  ) : (
                    <Button
                      onClick={() => pay(e.employeeId, e.employeeName)}
                      disabled={saving || e.netPay === null}
                    >
                      <Banknote className="size-4" />
                      صرف
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-bold">حركات الشهر</h2>
        <Table
          headers={[
            "التاريخ",
            "الموظف",
            "النوع",
            "المبلغ",
            "المسجل",
            "ملاحظات",
          ]}
        >
          {data?.advances.map((x) => (
            <tr key={`a-${x.id}`}>
              <td>{x.entryDate}</td>
              <td>{x.employeeName}</td>
              <td>سلفة</td>
              <td className="tnum">{formatMoney(x.amount)}</td>
              <td>{x.recordedByName}</td>
              <td>{x.note ?? "—"}</td>
            </tr>
          ))}
          {data?.adjustments.map((x) => (
            <tr key={`j-${x.id}`}>
              <td>{x.entryDate}</td>
              <td>{x.employeeName}</td>
              <td>{x.type === "bonus" ? "مكافأة" : "خصم"}</td>
              <td className="tnum">{formatMoney(x.amount)}</td>
              <td>{x.recordedByName}</td>
              <td>{x.note ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
