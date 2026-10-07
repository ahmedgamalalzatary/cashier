"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import type { ExpenseCategory } from "@cashier/shared";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { Button } from "@cashier/web-core/components/ui/button";
import { SelectField } from "@cashier/web-core/components/ui/select-field";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { cairoCalendarDate } from "@cashier/web-core/lib/cairo-date";
import {
  createExpense,
  listExpenseCategories,
} from "@/services/expenses-service";

/**
 * The expense entry form, used by the expenses page and by POS. When the page
 * passes its categories, a category added there appears immediately; POS loads
 * them itself. Errors render inside the form (T5).
 */
export function ExpenseEntryForm({
  categories,
  onSaved,
}: {
  categories?: ExpenseCategory[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [ownCategories, setOwnCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(categories === undefined);
  const [loadError, setLoadError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(cairoCalendarDate);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (categories !== undefined) return;
    let cancelled = false;
    listExpenseCategories()
      .then((rows) => {
        if (!cancelled) setOwnCategories(rows);
      })
      .catch((cause: Error) => {
        if (!cancelled) setLoadError(cause.message || "تعذر تحميل التصنيفات");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const activeCategories = (categories ?? ownCategories).filter(
    (category) => category.isActive,
  );

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await createExpense({
        clientRequestId: requestId,
        categoryId: Number(categoryId),
        amount: Number(amount),
        expenseDate: isAdmin ? expenseDate : undefined,
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      setRequestId(crypto.randomUUID());
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="جارِ تحميل التصنيفات…" />;
  }
  if (loadError) {
    return <ErrorBanner>{loadError}</ErrorBanner>;
  }

  return (
    <div>
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
        {isAdmin && (
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
      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      <Button
        onClick={() => void submit()}
        disabled={saving || !categoryId || Number(amount) <= 0}
        className="mt-4"
      >
        <Receipt className="size-4" />
        {saving ? "جارِ التسجيل…" : "تسجيل المصروف"}
      </Button>
    </div>
  );
}
