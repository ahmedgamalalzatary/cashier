"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { Category, InventoryStockRow, Item } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { ItemFormModal } from "@/components/warehouse/item-form-modal";
import { formatItemCode, formatMoney } from "@/lib/format";
import { listCategories } from "@/services/categories-service";
import { getMainWarehouseStock } from "@/services/inventory-service";
import { listItems } from "@/services/items-service";

export default function WarehousePage() {
  const [products, setProducts] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    Promise.all([listItems(), listCategories(), getMainWarehouseStock()])
      .then(([productRows, categoryRows, stockRows]) => {
        setProducts(productRows);
        setCategories(categoryRows);
        setStock(stockRows);
        setError("");
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "تعذر تحميل المخزن"),
      );
  }, [reload]);
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    return stock.filter((row) =>
      `${row.productName} ${row.colorName} ${row.sizeName} ${row.code} ${row.barcode ?? ""}`
        .toLocaleLowerCase("ar")
        .includes(normalized),
    );
  }, [query, stock]);

  return (
    <div>
      <PageHeader
        title="المخزن الرئيسي"
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4" /> منتج جديد
          </Button>
        }
      />
      <input
        aria-label="بحث"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="ابحث بالمنتج أو اللون أو المقاس أو الباركود"
        className="mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2"
      />
      {error && <p className="mb-4 text-danger">{error}</p>}
      <Table headers={["الكود", "المنتج", "اللون", "المقاس", "الرصيد", "القيمة", "الحالة", ""]}>
        {rows.map((row) => {
          const product = products.find((candidate) =>
            candidate.variants.some((variant) => variant.id === row.variantId),
          );
          return (
            <tr key={row.variantId}>
              <td className="px-4 py-3">{formatItemCode(row.code)}</td>
              <td className="px-4 py-3 font-medium">{row.productName}</td>
              <td className="px-4 py-3">{row.colorName}</td>
              <td className="px-4 py-3">{row.sizeName}</td>
              <td className="px-4 py-3">{Number(row.quantity).toLocaleString("ar-EG")} قطعة</td>
              <td className="px-4 py-3">{formatMoney(row.stockValue)}</td>
              <td className="px-4 py-3">{row.isActive ? "نشط" : "موقوف"}</td>
              <td className="px-4 py-3">
                {product && (
                  <IconButton title="تعديل المنتج" onClick={() => { setEditing(product); setOpen(true); }}>
                    <Pencil className="size-4" />
                  </IconButton>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      {open && (
        <ItemFormModal
          key={editing?.id ?? "new"}
          item={editing}
          categories={categories}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); setReload((value) => value + 1); }}
        />
      )}
    </div>
  );
}
