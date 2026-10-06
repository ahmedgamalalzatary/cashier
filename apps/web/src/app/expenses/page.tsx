"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpenseCategory, ExpenseSummary } from "@cashier/shared";
import { Plus, Receipt } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { SelectField } from "@/components/ui/select-field";
import { EmptyState, ErrorBanner } from "@/components/ui/states";
import { cairoCalendarDate } from "@/lib/cairo-date";
import { formatMoney } from "@/lib/format";
import {
  createExpense,
  createExpenseCategory,
  listExpenseCategories,
  listExpenses,
  updateExpenseCategory,
} from "@/services/expenses-service";

export default function ExpensesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [entries, setEntries] = useState<ExpenseSummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(cairoCalendarDate);
  const [note, setNote] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [nextCategories, nextEntries] = await Promise.all([
      listExpenseCategories(),
      listExpenses(),
    ]);
    setCategories(nextCategories);
    setEntries(nextEntries);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listExpenseCategories(), listExpenses()])
      .then(([nextCategories, nextEntries]) => {
        if (cancelled) return;
        setCategories(nextCategories);
        setEntries(nextEntries);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories],
  );

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await createExpense({
        clientRequestId: requestId,
        categoryId: Number(categoryId),
        amount: Number(amount),
        expenseDate: user?.role === "admin" ? expenseDate : undefined,
        note: note.trim() || null,
      });
      await load();
      setAmount("");
      setNote("");
      setRequestId(crypto.randomUUID());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      const created = await createExpenseCategory(newCategory);
      setCategories((current) => [...current, created]);
      setNewCategory("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const columns: DataColumn<ExpenseSummary>[] = [
    {
      key: "date",
      header: "التاريخ",
      mobile: "primary",
      cell: (entry) => (
        <span className="tnum">
          {new Date(`${entry.expenseDate}T00:00:00`).toLocaleDateString("ar-EG")}
        </span>
      ),
    },
    {
      key: "type",
      header: "النوع",
      cell: (entry) => (entry.type === "shift" ? "وردية" : "عام"),
    },
    { key: "category", header: "التصنيف", cell: (entry) => entry.categoryName },
    {
      key: "amount",
      header: "المبلغ",
      numeric: true,
      cell: (entry) => (
        <span className="font-bold">{formatMoney(entry.amount)}</span>
      ),
    },
    { key: "by", header: "المسجل", cell: (entry) => entry.recordedByName },
    { key: "note", header: "ملاحظات", cell: (entry) => entry.note ?? "—" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المصروفات"
        description={
          user?.role === "admin"
            ? "تسجيل المصروفات العامة وتصنيفاتها."
            : "تسجيل المصروفات المدفوعة من درج الوردية."
        }
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Section
        title={
          user?.role === "admin" ? "تسجيل مصروف عام" : "مصروف من درج الوردية"
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="تصنيف المصروف"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setRequestId(crypto.randomUUID());
            }}
          >
            <option value="">اختر التصنيف</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">المبلغ</span>
            <input
              aria-label="المبلغ"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              placeholder="المبلغ"
              className="input tnum"
            />
          </label>
          {user?.role === "admin" && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">تاريخ المصروف</span>
              <input
                aria-label="تاريخ المصروف"
                type="date"
                value={expenseDate}
                onChange={(event) => {
                  setExpenseDate(event.target.value);
                  setRequestId(crypto.randomUUID());
                }}
                className="input"
              />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ملاحظات</span>
            <input
              aria-label="ملاحظات"
              value={note}
              maxLength={500}
              onChange={(event) => {
                setNote(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              placeholder="ملاحظات اختيارية"
              className="input"
            />
          </label>
        </div>
        <Button
          onClick={submit}
          disabled={saving || !categoryId || Number(amount) <= 0}
          className="mt-4"
        >
          <Receipt className="size-4" />
          {saving ? "جارِ التسجيل…" : "تسجيل المصروف"}
        </Button>
      </Section>

      {user?.role === "admin" && (
        <Section title="تصنيفات المصروفات" bodyClassName="p-0">
          <div className="flex gap-2 p-4">
            <input
              aria-label="اسم التصنيف الجديد"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              className="input min-w-0 flex-1"
              placeholder="مثال: صيانة"
            />
            <Button onClick={addCategory} disabled={!newCategory.trim()}>
              <Plus className="size-4" />
              إضافة
            </Button>
          </div>
          <ul className="ledger border-t border-line">
            {categories.map((category) => (
              <li key={category.id} className="flex gap-2 px-4 py-2">
                <input
                  aria-label={`اسم تصنيف ${category.name}`}
                  defaultValue={category.name}
                  maxLength={191}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== category.name)
                      updateExpenseCategory(category.id, { name })
                        .then(load)
                        .catch((cause: Error) => setError(cause.message));
                  }}
                  className={`input min-w-0 flex-1 ${
                    category.isActive ? "" : "text-muted line-through"
                  }`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateExpenseCategory(category.id, {
                      isActive: !category.isActive,
                    })
                      .then(load)
                      .catch((cause: Error) => setError(cause.message))
                  }
                >
                  {category.isActive ? "إيقاف" : "تفعيل"}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">سجل المصروفات</h2>
        <DataTable
          caption="سجل المصروفات"
          rows={entries}
          rowKey={(entry) => entry.id}
          columns={columns}
          empty={
            <EmptyState
              icon={<Receipt className="size-8" />}
              title="لا توجد مصروفات بعد"
              description="سجّل أول مصروف أعلاه."
            />
          }
        />
      </section>
    </div>
  );
}
