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
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Field, TextAreaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/select-field";
import { EmptyState, ErrorBanner } from "@/components/ui/states";
import { Table } from "@/components/ui/table";
import {
  confirmReasonFor,
  countedLinesFromDraft,
} from "@/models/stocktake-model";
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
    [note, setNote] = useState(""),
    [confirmReason, setConfirmReason] = useState("");
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
      if (!active) return;
      const reason = confirmReasonFor(confirmReason);
      if (!reason.ok) throw new Error("اكتب سبب اعتماد الجرد");
      const counted = countedLinesFromDraft(active.lines);
      if (!counted.ok) throw new Error("أدخل الكمية الفعلية لكل صنف");
      await updateStocktakeCounts(active.id, counted.lines);
      const confirmed = await confirmStocktake(active.id, reason.reason);
      setActive(confirmed);
      setConfirmReason("");
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

  const historyColumns: DataColumn<StocktakeSummary>[] = [
    {
      key: "id",
      header: "المستند",
      mobile: "primary",
      cell: (row) => <span className="tnum font-medium">#{row.id}</span>,
    },
    {
      key: "kind",
      header: "النوع",
      cell: (row) => (row.kind === "manual" ? "تسوية يدوية" : "جرد"),
    },
    {
      key: "warehouse",
      header: "المخزن",
      cell: (row) => (row.warehouse === "main" ? "الرئيسي" : "الكافيه"),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => (
        <Badge tone={row.status === "confirmed" ? "success" : "neutral"}>
          {row.status === "confirmed" ? "معتمد" : "مسودة"}
        </Badge>
      ),
    },
    { key: "lines", header: "الأصناف", numeric: true, cell: (row) => row.lineCount },
    { key: "by", header: "المسجل", cell: (row) => row.createdByName },
    {
      key: "at",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-muted">
          {new Date(row.createdAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الجرد والتسويات المخزنية"
        description="جلسات جرد كاملة أو تسوية صنف واحد، مع سجل ثابت لكل مستند."
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <section className="grid gap-4 lg:grid-cols-2">
        <Section title="جلسة جرد جديدة" icon={<ClipboardCheck className="size-5" />}>
          <div className="space-y-4">
            <SelectField
              label="المخزن"
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
            >
              <option value="main">المخزن الرئيسي</option>
              <option value="cafe">مخزن الكافيه</option>
            </SelectField>
            <SelectField
              label="نطاق التصنيف"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">كل الأصناف</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
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
        </Section>

        <Section title="تسوية صنف واحد" icon={<Scale className="size-5" />}>
          <div className="space-y-4">
            <SelectField
              label="الصنف"
              value={manualItem}
              onChange={(e) => setManualItem(e.target.value)}
            >
              <option value="">اختر الصنف</option>
              {stock.map((row) => (
                <option key={row.itemId} value={row.itemId}>
                  {row.name} — الحالي {row.quantity} {row.stockUnit}
                </option>
              ))}
            </SelectField>
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
        </Section>
      </section>

      {active && active.status === "draft" && (
        <Section title={`إدخال العد الفعلي — جلسة #${active.id}`}>
          <div className="space-y-4">
            <Table headers={["الصنف", "المسجل", "الفعلي", "الفرق"]}>
              {active.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{line.itemName}</td>
                  <td className="tnum px-4 py-3">
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
                      className="input w-32"
                    />
                  </td>
                  <td className="tnum px-4 py-3">{line.difference ?? "—"}</td>
                </tr>
              ))}
            </Table>
            <TextAreaField
              label="سبب اعتماد الجرد"
              required
              value={confirmReason}
              onChange={(e) => setConfirmReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={saveCounts} disabled={busy}>
                حفظ العد
              </Button>
              <Button onClick={confirm} disabled={busy}>
                اعتماد الجرد
              </Button>
            </div>
          </div>
        </Section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">سجل الجرد والتسويات</h2>
        <DataTable
          caption="سجل الجرد والتسويات"
          rows={history}
          rowKey={(row) => row.id}
          columns={historyColumns}
          empty={
            <EmptyState
              icon={<ClipboardCheck className="size-8" />}
              title="لا يوجد سجل جرد بعد"
              description="ابدأ جلسة جرد أو سجّل تسوية صنف واحد."
            />
          }
          actions={(row) =>
            row.status === "draft" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  run(async () => setActive(await getStocktake(row.id)))
                }
                disabled={busy}
              >
                متابعة
              </Button>
            ) : null
          }
        />
      </section>
    </div>
  );
}
