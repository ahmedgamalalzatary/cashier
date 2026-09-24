"use client";
import { useEffect, useState } from "react";
import type {
  Category,
  InventoryStockRow,
  StocktakeDetail,
  StocktakeSummary,
  Warehouse,
} from "@cashier/shared";
import { ClipboardCheck, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { countedLinesFromDraft } from "@/models/stocktake-model";
import { listCategories } from "@/services/categories-service";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import {
  confirmStocktake,
  createManualAdjustment,
  getStocktake,
  listStocktakes,
  startStocktake,
  updateStocktakeCounts,
} from "@/services/stocktakes-service";

export default function StocktakesPage() {
  const [history, setHistory] = useState<StocktakeSummary[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [active, setActive] = useState<StocktakeDetail | null>(null),
    [warehouse, setWarehouse] = useState<Warehouse>("main"),
    [categoryId, setCategoryId] = useState(""),
    [note, setNote] = useState("");
  const [manualItem, setManualItem] = useState(""),
    [manualCount, setManualCount] = useState(""),
    [manualNote, setManualNote] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async (selected: Warehouse = warehouse) => {
    const [documents, categoryRows, stockRows] = await Promise.all([
      listStocktakes(),
      listCategories(),
      selected === "main" ? getMainWarehouseStock() : getCafeWarehouseStock(),
    ]);
    setHistory(documents);
    setCategories(categoryRows);
    setStock(stockRows);
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listStocktakes(),
      listCategories(),
      getMainWarehouseStock(),
    ])
      .then(([documents, categoryRows, stockRows]) => {
        if (cancelled) return;
        setHistory(documents);
        setCategories(categoryRows);
        setStock(stockRows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الجرد");
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () =>
      setActive(
        await startStocktake({
          warehouse,
          categoryId: categoryId ? Number(categoryId) : null,
          note: note.trim() || null,
        }),
      ),
    );
  const saveCounts = () =>
    run(async () => {
      if (!active) return;
      const counted = countedLinesFromDraft(active.lines);
      if (!counted.ok) throw new Error("أدخل الكمية الفعلية لكل صنف");
      setActive(await updateStocktakeCounts(active.id, counted.lines));
    });
  const confirm = () =>
    run(async () => {
      if (!active || !note.trim()) throw new Error("اكتب سبب اعتماد الجرد");
      const counted = countedLinesFromDraft(active.lines);
      if (!counted.ok) throw new Error("أدخل الكمية الفعلية لكل صنف");
      await updateStocktakeCounts(active.id, counted.lines);
      const confirmed = await confirmStocktake(active.id, note.trim());
      setActive(confirmed);
      await load();
    });
  const manual = () =>
    run(async () => {
      if (!manualItem || manualCount === "" || !manualNote.trim())
        throw new Error("أكمل بيانات التسوية وسببها");
      await createManualAdjustment({
        warehouse,
        itemId: Number(manualItem),
        countedQuantity: Number(manualCount),
        note: manualNote.trim(),
      });
      setManualItem("");
      setManualCount("");
      setManualNote("");
      await load();
    });
  return (
    <div className="space-y-6">
      <PageHeader title="الجرد والتسويات المخزنية" />
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-bold">
            <ClipboardCheck className="size-5" />
            جلسة جرد جديدة
          </h2>
          <select
            aria-label="المخزن"
            value={warehouse}
            onChange={(e) => {
              const selected = e.target.value as Warehouse;
              setWarehouse(selected);
              (selected === "main"
                ? getMainWarehouseStock()
                : getCafeWarehouseStock()
              )
                .then(setStock)
                .catch((caught: Error) => setError(caught.message));
            }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          >
            <option value="main">المخزن الرئيسي</option>
            <option value="cafe">مخزن الكافيه</option>
          </select>
          <select
            aria-label="نطاق التصنيف"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          >
            <option value="">كل الأصناف</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <TextAreaField
            label="ملاحظة البدء (اختيارية)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={start} disabled={busy}>
            <Plus className="size-4" />
            بدء الجرد
          </Button>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Scale className="size-5" />
            تسوية صنف واحد
          </h2>
          <select
            aria-label="صنف التسوية"
            value={manualItem}
            onChange={(e) => setManualItem(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          >
            <option value="">اختر الصنف</option>
            {stock.map((row) => (
              <option key={row.itemId} value={row.itemId}>
                {row.name} — الحالي {row.quantity} {row.stockUnit}
              </option>
            ))}
          </select>
          <Field
            label="الكمية الفعلية"
            type="number"
            min="0"
            step="0.001"
            value={manualCount}
            onChange={(e) => setManualCount(e.target.value)}
          />
          <TextAreaField
            label="سبب التسوية"
            required
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
          />
          <Button onClick={manual} disabled={busy}>
            حفظ التسوية
          </Button>
        </div>
      </section>
      {active && active.status === "draft" && (
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-bold">إدخال العد الفعلي — جلسة #{active.id}</h2>
          <Table headers={["الصنف", "المسجل", "الفعلي", "الفرق"]}>
            {active.lines.map((line, index) => (
              <tr key={line.id}>
                <td className="px-4 py-3">{line.itemName}</td>
                <td className="px-4 py-3 tnum">
                  {line.recordedQuantity} {line.stockUnit}
                </td>
                <td className="px-4 py-3">
                  <input
                    aria-label={`الكمية الفعلية ${line.itemName}`}
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.countedQuantity ?? ""}
                    onChange={(e) =>
                      setActive({
                        ...active,
                        lines: active.lines.map((candidate, i) =>
                          i === index
                            ? {
                                ...candidate,
                                countedQuantity: e.target.value,
                                difference:
                                  e.target.value === ""
                                    ? null
                                    : (
                                        Number(e.target.value) -
                                        Number(candidate.recordedQuantity)
                                      ).toFixed(3),
                              }
                            : candidate,
                        ),
                      })
                    }
                    className="w-32 rounded-lg border border-line px-3 py-2"
                  />
                </td>
                <td className="px-4 py-3 tnum">{line.difference ?? "—"}</td>
              </tr>
            ))}
          </Table>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={saveCounts} disabled={busy}>
              حفظ العد
            </Button>
            <Button onClick={confirm} disabled={busy}>
              اعتماد الجرد
            </Button>
          </div>
        </section>
      )}
      <section className="space-y-3">
        <h2 className="font-bold">سجل الجرد والتسويات</h2>
        <Table
          headers={[
            "المستند",
            "النوع",
            "المخزن",
            "الحالة",
            "الأصناف",
            "المسجل",
            "التاريخ",
            "",
          ]}
        >
          {history.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">#{row.id}</td>
              <td className="px-4 py-3">
                {row.kind === "manual" ? "تسوية يدوية" : "جرد"}
              </td>
              <td className="px-4 py-3">
                {row.warehouse === "main" ? "الرئيسي" : "الكافيه"}
              </td>
              <td className="px-4 py-3">
                {row.status === "confirmed" ? "معتمد" : "مسودة"}
              </td>
              <td className="px-4 py-3">{row.lineCount}</td>
              <td className="px-4 py-3">{row.createdByName}</td>
                <td className="px-4 py-3">
                  {new Date(row.createdAt).toLocaleString("ar-EG")}
                </td>
                <td className="px-4 py-3">
                  {row.status === "draft" && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        run(async () => setActive(await getStocktake(row.id)))
                      }
                      disabled={busy}
                    >
                      متابعة
                    </Button>
                  )}
                </td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
