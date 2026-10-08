"use client";
import { useCallback, useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import type { SalaryMonth } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { ConfirmDialog } from "@cashier/web-core/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@cashier/web-core/components/ui/data-table";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Section } from "@cashier/web-core/components/ui/section";
import { SelectField } from "@cashier/web-core/components/ui/select-field";
import { EmptyState, ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { Table } from "@cashier/web-core/components/ui/table";
import { cairoCalendarDate } from "@cashier/web-core/lib/cairo-date";
import { formatMoney } from "@cashier/web-core/lib/format";
import {
  payConfirmationText,
  salaryBlockedLabel,
} from "@/models/salary-model";
import {
  createSalaryAdjustment,
  createSalaryAdvance,
  getSalaryMonth,
  paySalary,
} from "@/services/salaries-service";

type Row = NonNullable<SalaryMonth["employees"]>[number];

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
  const [paying, setPaying] = useState<Row | null>(null);
  const [payingError, setPayingError] = useState("");
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
        employeeId: employeeId,
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
  async function pay() {
    if (!paying) return;
    setSaving(true);
    setPayingError("");
    try {
      await paySalary(paying.employeeId, month);
      setPaying(null);
      await load();
    } catch (cause) {
      setPayingError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const columns: DataColumn<Row>[] = [
    {
      key: "employee",
      header: "الموظف",
      mobile: "primary",
      cell: (e) => e.employeeName,
    },
    {
      key: "base",
      header: "الراتب",
      numeric: true,
      cell: (e) => {
        if (e.basePay !== null) return formatMoney(e.basePay);
        const reason = salaryBlockedLabel(e);
        return reason ? (
          <span className="text-muted">{reason}</span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "bonuses",
      header: "المكافآت",
      numeric: true,
      cell: (e) => formatMoney(e.bonuses),
    },
    {
      key: "deductions",
      header: "الخصومات",
      numeric: true,
      cell: (e) => formatMoney(e.deductions),
    },
    {
      key: "advances",
      header: "السلف",
      numeric: true,
      cell: (e) => formatMoney(e.advances),
    },
    {
      key: "net",
      header: "الصافي",
      numeric: true,
      cell: (e) => (
        <span className="font-bold">
          {e.netPay === null ? "—" : formatMoney(e.netPay)}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (e) =>
        e.payment ? (
          <span className="text-success">تم الصرف</span>
        ) : (
          <Button
            size="sm"
            onClick={() => setPaying(e)}
            disabled={saving || e.netPay === null}
          >
            <Banknote className="size-4" />
            صرف
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-5">
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
              className="input w-auto"
            />
          </label>
        }
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Section title="تسجيل سلفة أو تسوية">
        <div className="grid gap-4 md:grid-cols-5">
          <SelectField
            label="الموظف"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">اختر الموظف</option>
            {data?.employees.map((e) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.employeeName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="النوع"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="advance">سلفة</option>
            <option value="bonus">مكافأة</option>
            <option value="deduction">خصم</option>
          </SelectField>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">المبلغ</span>
            <input
              aria-label="المبلغ"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ"
              className="input tnum"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">التاريخ</span>
            <input
              aria-label="التاريخ"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ملاحظات</span>
            <input
              aria-label="ملاحظات"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظات"
              className="input"
            />
          </label>
        </div>
        <Button
          className="mt-4"
          onClick={addEntry}
          disabled={saving || !employeeId || Number(amount) <= 0}
        >
          <Plus className="size-4" />
          تسجيل
        </Button>
      </Section>

      <section className="space-y-3">
        <h2 className="font-bold">كشف رواتب الشهر</h2>
        {loading ? (
          <LoadingState />
        ) : (
          <DataTable
            caption="كشف رواتب الشهر"
            rows={data?.employees ?? []}
            rowKey={(e) => e.employeeId}
            rowClassName={(e) => (e.isActive ? undefined : "opacity-60")}
            columns={columns}
            empty={
              <EmptyState
                icon={<Banknote className="size-8" />}
                title="لا توجد رواتب لهذا الشهر"
                description="أضف موظفين براتب شهري لعرض الكشف."
              />
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">حركات الشهر</h2>
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
              <td className="px-4 py-3">{x.entryDate}</td>
              <td className="px-4 py-3">{x.employeeName}</td>
              <td className="px-4 py-3">سلفة</td>
              <td className="tnum px-4 py-3">{formatMoney(x.amount)}</td>
              <td className="px-4 py-3">{x.recordedByName}</td>
              <td className="px-4 py-3">{x.note ?? "—"}</td>
            </tr>
          ))}
          {data?.adjustments.map((x) => (
            <tr key={`j-${x.id}`}>
              <td className="px-4 py-3">{x.entryDate}</td>
              <td className="px-4 py-3">{x.employeeName}</td>
              <td className="px-4 py-3">
                {x.type === "bonus" ? "مكافأة" : "خصم"}
              </td>
              <td className="tnum px-4 py-3">{formatMoney(x.amount)}</td>
              <td className="px-4 py-3">{x.recordedByName}</td>
              <td className="px-4 py-3">{x.note ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </section>

      <ConfirmDialog
        open={paying !== null}
        title="صرف الراتب"
        description={
          paying && paying.netPay !== null
            ? payConfirmationText({
                name: paying.employeeName,
                month,
                netPay: paying.netPay,
                unpaidEarlierMonths: paying.unpaidEarlierMonths,
              })
            : undefined
        }
        confirmLabel="صرف الراتب"
        busy={saving}
        error={payingError}
        onConfirm={() => void pay()}
        onCancel={() => {
          setPaying(null);
          setPayingError("");
        }}
      />
    </div>
  );
}
