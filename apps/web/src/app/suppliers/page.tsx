"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Ban, HandCoins, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { SupplierFormModal, PaymentModal, type Supplier } from "./supplier-modals";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    api<Supplier[]>("/api/suppliers")
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
    if (!confirm(`إيقاف التعامل مع "${s.name}"؟`)) return;
    try {
      await api(`/api/suppliers/${s.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إيقاف المورد");
    }
  }

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

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-muted">جارِ التحميل…</p>
      ) : suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا يوجد موردون بعد — أضف أول مورد بزر «مورد جديد».
        </p>
      ) : (
        <Table headers={["المورد", "الهاتف", "الرصيد المستحق", "الحالة", "إجراءات"]}>
          {suppliers.map((s) => (
            <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3 tnum">{s.phone || "—"}</td>
              <td className="px-4 py-3 tnum">
                <span className={Number(s.balance) > 0 ? "text-danger font-medium" : "text-success"}>
                  {formatMoney(s.balance)}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge tone={s.isActive ? "success" : "neutral"}>
                  {s.isActive ? "نشط" : "موقوف"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <Link
                    href={`/suppliers/${s.id}`}
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
                  {s.isActive && (
                    <IconBtn title="إيقاف" onClick={() => deactivate(s)} danger>
                      <Ban className="size-4" />
                    </IconBtn>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
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
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
