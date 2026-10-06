"use client";

import { useEffect, useState } from "react";
import type { ExpenseCategory, ExpenseSummary } from "@cashier/shared";
import { Plus, Receipt } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { ExpenseEntryForm } from "@/components/expenses/expense-entry-form";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState, ErrorBanner } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import {
  createExpenseCategory,
  listExpenseCategories,
  listExpenses,
  updateExpenseCategory,
} from "@/services/expenses-service";

export default function ExpensesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [entries, setEntries] = useState<ExpenseSummary[]>([]);
  const [newCategory, setNewCategory] = useState("");
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
        <ExpenseEntryForm
          categories={categories}
          onSaved={() => void load().catch(() => undefined)}
        />
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
