"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Ban,
  HandCoins,
  FileText,
  RotateCcw,
  Search,
  Truck,
} from "lucide-react";
import type { Supplier } from "@cashier/shared";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { IconButton as IconBtn } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { SupplierFormModal } from "@/components/suppliers/supplier-form-modal";
import { PaymentModal } from "@/components/suppliers/payment-modal";
import { supplierBalanceClass } from "@/models/supplier-model";
import {
  deactivateSupplier,
  listSuppliers,
  reactivateSupplier,
} from "@/services/suppliers-service";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<Supplier | null>(null);
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [confirmingError, setConfirmingError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    listSuppliers()
      .then((rows) => {
        if (cancelled) return;
        setSuppliers(rows);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "تعذر تحميل الموردين");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function deactivate(s: Supplier) {
    setConfirmingBusy(true);
    setConfirmingError("");
    try {
      await deactivateSupplier(s.id);
      setConfirming(null);
      reload();
    } catch (e) {
      setConfirmingError(
        e instanceof Error ? e.message : "تعذر إيقاف المورد",
      );
    } finally {
      setConfirmingBusy(false);
    }
  }

  async function reactivate(s: Supplier) {
    try {
      await reactivateSupplier(s.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إعادة تفعيل المورد");
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(normalized) ||
            (s.phone ?? "").includes(normalized),
        )
      : suppliers;
  }, [suppliers, query]);

  const columns: DataColumn<Supplier>[] = [
    {
      key: "name",
      header: "المورد",
      mobile: "primary",
      cell: (s) => <span className="font-medium">{s.name}</span>,
    },
    {
      key: "phone",
      header: "الهاتف",
      cell: (s) => (
        <span className="tnum" dir="ltr">
          {s.phone || "—"}
        </span>
      ),
    },
    {
      key: "balance",
      header: "الرصيد المستحق",
      numeric: true,
      cell: (s) => (
        <span className={`font-medium ${supplierBalanceClass(s.balance)}`}>
          {formatMoney(s.balance)}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (s) => (
        <Badge tone={s.isActive ? "success" : "neutral"}>
          {s.isActive ? "نشط" : "موقوف"}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الموردين"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> مورد جديد
          </Button>
        }
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {!loading && suppliers.length > 0 && (
        <div className="toolbar mb-4">
          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <input
              aria-label="البحث عن مورد"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو الهاتف"
              className="input ps-9"
            />
          </label>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          caption="قائمة الموردين"
          rows={visible}
          rowKey={(s) => s.id}
          rowClassName={(s) => (s.isActive ? undefined : "opacity-55")}
          columns={columns}
          empty={
            suppliers.length === 0 ? (
              <EmptyState
                icon={<Truck className="size-8" />}
                title="لا يوجد موردون بعد"
                description="أضف أول مورد، أو أنشئه مباشرة من فاتورة الشراء."
              />
            ) : (
              <p className="empty-state text-sm text-muted">
                لا يوجد موردون يطابقون البحث.
              </p>
            )
          }
          actions={(s) => (
            <div className="flex items-center gap-1">
              <Link
                href={`/suppliers/statement?id=${s.id}`}
                title="كشف حساب"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-line/50 hover:text-ink"
              >
                <FileText className="size-4" />
              </Link>
              <IconBtn title="تسجيل دفعة" onClick={() => setPayingSupplier(s)}>
                <HandCoins className="size-4" />
              </IconBtn>
              <IconBtn
                title="تعديل"
                onClick={() => {
                  setEditing(s);
                  setFormOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </IconBtn>
              {s.isActive ? (
                <IconBtn
                  title="إيقاف"
                  danger
                  onClick={() => {
                    setConfirmingError("");
                    setConfirming(s);
                  }}
                >
                  <Ban className="size-4" />
                </IconBtn>
              ) : (
                <IconBtn title="إعادة التفعيل" onClick={() => reactivate(s)}>
                  <RotateCcw className="size-4" />
                </IconBtn>
              )}
            </div>
          )}
        />
      )}

      {formOpen && (
        <SupplierFormModal
          key={editing?.id ?? "new"}
          supplier={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            reload();
          }}
        />
      )}
      {payingSupplier && (
        <PaymentModal
          key={payingSupplier.id}
          supplier={payingSupplier}
          onClose={() => setPayingSupplier(null)}
          onSaved={() => {
            setPayingSupplier(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        title="إيقاف التعامل مع المورد"
        description={
          confirming
            ? `سيُوقف التعامل مع "${confirming.name}" مع بقاء سجلاته.`
            : undefined
        }
        tone="danger"
        confirmLabel="إيقاف المورد"
        busy={confirmingBusy}
        error={confirmingError}
        onConfirm={() => confirming && void deactivate(confirming)}
        onCancel={() => {
          setConfirming(null);
          setConfirmingError("");
        }}
      />
    </div>
  );
}
