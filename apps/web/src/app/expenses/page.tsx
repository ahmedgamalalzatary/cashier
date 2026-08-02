"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpenseCategory, ExpenseSummary } from "@cashier/shared";
import { Plus, Receipt } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
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
      setAmount("");
      setNote("");
      setRequestId(crypto.randomUUID());
      await load();
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

  return (
    <div className="space-y-6">
      <PageHeader title="المصروفات" />
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>
      )}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-4 font-bold">
          {user?.role === "admin" ? "تسجيل مصروف عام" : "مصروف من درج الوردية"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select aria-label="تصنيف المصروف" value={categoryId}
            onChange={(event) => { setCategoryId(event.target.value); setRequestId(crypto.randomUUID()); }}
            className="h-11 rounded-xl border border-line bg-paper px-3">
            <option value="">اختر التصنيف</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input aria-label="المبلغ" type="number" min="0.01" step="0.01"
            value={amount} onChange={(event) => { setAmount(event.target.value); setRequestId(crypto.randomUUID()); }}
            placeholder="المبلغ" className="h-11 rounded-xl border border-line bg-paper px-3 tnum" />
          {user?.role === "admin" && (
            <input aria-label="تاريخ المصروف" type="date" value={expenseDate}
              onChange={(event) => { setExpenseDate(event.target.value); setRequestId(crypto.randomUUID()); }}
              className="h-11 rounded-xl border border-line bg-paper px-3" />
          )}
          <input aria-label="ملاحظات" value={note} maxLength={500}
            onChange={(event) => { setNote(event.target.value); setRequestId(crypto.randomUUID()); }}
            placeholder="ملاحظات اختيارية" className="h-11 rounded-xl border border-line bg-paper px-3" />
        </div>
        <Button onClick={submit} disabled={saving || !categoryId || Number(amount) <= 0} className="mt-4 justify-center">
          <Receipt className="size-4" />{saving ? "جارِ التسجيل…" : "تسجيل المصروف"}
        </Button>
      </section>

      {user?.role === "admin" && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-4 font-bold">تصنيفات المصروفات</h2>
          <div className="mb-4 flex gap-2">
            <input aria-label="اسم التصنيف الجديد" value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3" placeholder="مثال: صيانة" />
            <Button onClick={addCategory} disabled={!newCategory.trim()}><Plus className="size-4" />إضافة</Button>
          </div>
          <div className="space-y-2">
            {categories.map((category) => (
              <div key={category.id} className="flex gap-2">
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
                  className={`h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm ${
                    category.isActive ? "" : "text-muted line-through"
                  }`}
                />
                <Button
                  variant="ghost"
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
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-bold">سجل المصروفات</h2>
        <Table headers={["التاريخ", "النوع", "التصنيف", "المبلغ", "المسجل", "ملاحظات"]}>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(`${entry.expenseDate}T00:00:00`).toLocaleDateString("ar-EG")}</td>
              <td>{entry.type === "shift" ? "وردية" : "عام"}</td>
              <td>{entry.categoryName}</td>
              <td className="tnum font-bold">{formatMoney(entry.amount)}</td>
              <td>{entry.recordedByName}</td>
              <td>{entry.note ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
