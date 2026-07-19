"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Coffee,
  Eye,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import type {
  InventoryStockRow,
  TransferRequestStatus,
  TransferRequestSummary,
  TransferSummary,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { TransferFormModal } from "@/components/transfers/transfer-form-modal";
import { TransferReviewModal } from "@/components/transfers/transfer-review-modal";
import {
  CafeHeaderActions,
  CafeTabs,
  type CafeTab,
} from "@/components/transfers/cafe-controls";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney, sumDecimalValues } from "@/lib/format";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import {
  listTransferRequests,
  listTransfers,
} from "@/services/transfers-service";

type FormMode = "request" | "direct" | null;

export default function CafePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [mainStock, setMainStock] = useState<InventoryStockRow[]>([]);
  const [requests, setRequests] = useState<TransferRequestSummary[]>([]);
  const [transfers, setTransfers] = useState<TransferSummary[]>([]);
  const [tab, setTab] = useState<CafeTab>("stock");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [cafeRows, requestRows, transferRows, mainRows] =
          await Promise.all([
            getCafeWarehouseStock(),
            listTransferRequests(),
            listTransfers(),
            isAdmin ? getMainWarehouseStock() : Promise.resolve([]),
          ]);
        if (cancelled) return;
        setStock(cafeRows);
        setRequests(requestRows);
        setTransfers(transferRows);
        setMainStock(mainRows);
        setError("");
      } catch (caught) {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر تحميل مخزن الكافيه والتحويلات",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const activeStock = stock.filter((row) => row.isActive);
  const lowStock = activeStock.filter((row) => row.isLowStock).length;
  const negativeStock = stock.filter((row) => row.isNegativeStock).length;
  const pendingRequests = requests.filter(
    (request) => request.status === "pending",
  ).length;
  const totalValue = sumDecimalValues(stock.map((row) => row.stockValue));
  const sortedStock = useMemo(
    () => [...stock].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [stock],
  );

  function saved() {
    setFormMode(null);
    setReviewingId(null);
    setReloadKey((current) => current + 1);
  }

  return (
    <div>
      <PageHeader
        title="مخزن الكافيه"
        actions={<CafeHeaderActions isAdmin={Boolean(isAdmin)} onRequest={() => setFormMode("request")} onDirect={() => setFormMode("direct")} />}
      />

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-5">
          <Summary icon={<Coffee className="size-5 text-accent" />} label="أصناف نشطة" value={String(activeStock.length)} />
          <Summary icon={<TriangleAlert className="size-5 text-accent" />} label="تحت حد التنبيه" value={String(lowStock)} danger={lowStock > 0} />
          <Summary icon={<TriangleAlert className="size-5 text-danger" />} label="أرصدة سالبة" value={String(negativeStock)} danger={negativeStock > 0} />
          <Summary icon={<ClipboardList className="size-5 text-accent" />} label="طلبات معلقة" value={String(pendingRequests)} danger={pendingRequests > 0} />
          <Summary icon={<WalletCards className="size-5 text-accent" />} label="قيمة الرصيد FIFO" value={formatMoney(totalValue)} />
        </div>
      </section>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <CafeTabs active={tab} pendingRequests={pendingRequests} onChange={setTab} />

      <section
        id={`cafe-${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`cafe-${tab}-tab`}
        tabIndex={0}
      >
        {loading ? (
          <p className="text-muted">جارِ تحميل دفتر الكافيه…</p>
        ) : tab === "stock" ? (
          <StockTable rows={sortedStock} />
        ) : tab === "requests" ? (
          <RequestsTable rows={requests} onOpen={setReviewingId} />
        ) : (
          <TransfersTable rows={transfers} />
        )}
      </section>

      {formMode && (
        <TransferFormModal mode={formMode} items={stock} mainStock={mainStock} onClose={() => setFormMode(null)} onSaved={saved} />
      )}
      {reviewingId !== null && (
        <TransferReviewModal requestId={reviewingId} isAdmin={Boolean(isAdmin)} mainStock={mainStock} onClose={() => setReviewingId(null)} onSaved={saved} />
      )}
    </div>
  );
}

function StockTable({ rows }: { rows: InventoryStockRow[] }) {
  if (rows.length === 0)
    return <Empty icon={<Boxes className="size-8" />} title="لا يوجد رصيد في الكافيه بعد" description="أنشئ طلب تحويل، ثم يعتمد المدير الكميات المتاحة من المخزن الرئيسي." />;
  return (
    <Table headers={["الصنف", "التصنيف", "الرصيد", "حد التنبيه", "قيمة FIFO", "الحالة"]}>
      {rows.map((row) => (
        <tr key={row.itemId} className={row.isActive ? "" : "opacity-55"}>
          <td className="px-4 py-3 font-medium">{row.name}</td>
          <td className="px-4 py-3 text-muted">{row.categoryName}</td>
          <td className="px-4 py-3 tnum font-medium">{Number(row.quantity).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} {row.stockUnit}</td>
          <td className="px-4 py-3 tnum text-muted">{Number(row.minimumLevel).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
          <td className="px-4 py-3 tnum">{formatMoney(row.stockValue)}</td>
          <td className="px-4 py-3">
            <Badge tone={row.isNegativeStock || row.isLowStock ? "danger" : row.isActive ? "success" : "neutral"}>
              {row.isNegativeStock ? "رصيد سالب" : row.isLowStock ? "منخفض" : row.isActive ? "متاح" : "موقوف"}
            </Badge>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function RequestsTable({ rows, onOpen }: { rows: TransferRequestSummary[]; onOpen: (id: number) => void }) {
  if (rows.length === 0)
    return <Empty icon={<ClipboardList className="size-8" />} title="لا توجد طلبات تحويل" description="طلبات فريق الكافيه ستظهر هنا للجميع لتجنب تكرار الاحتياج." />;
  return (
    <Table headers={["الطلب", "صاحب الطلب", "الأصناف", "وقت الطلب", "الحالة", ""]}>
      {rows.map((request) => (
        <tr key={request.id}>
          <td className="px-4 py-3 font-medium">#{request.id}</td>
          <td className="px-4 py-3">{request.requestedByName}</td>
          <td className="px-4 py-3 tnum">{request.lineCount}</td>
          <td className="px-4 py-3 text-muted">{new Date(request.createdAt).toLocaleString("ar-EG")}</td>
          <td className="px-4 py-3"><RequestStatus status={request.status} /></td>
          <td className="px-4 py-3">
            <button type="button" onClick={() => onOpen(request.id)} aria-label={`عرض طلب التحويل رقم ${request.id}`} title="عرض الطلب" className="rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"><Eye className="size-4" /></button>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function TransfersTable({ rows }: { rows: TransferSummary[] }) {
  if (rows.length === 0)
    return <Empty icon={<ArrowLeftRight className="size-8" />} title="لم تُنفذ تحويلات بعد" description="التحويلات المعتمدة والمباشرة ستظهر هنا كوثائق مخزنية ثابتة." />;
  return (
    <Table headers={["التحويل", "المصدر", "صاحب الطلب", "اعتمده", "التكلفة", "الوقت", ""]}>
      {rows.map((transfer) => (
        <tr key={transfer.id}>
          <td className="px-4 py-3 font-medium">#{transfer.id}</td>
          <td className="px-4 py-3">{transfer.requestId ? `طلب #${transfer.requestId}` : "تحويل مباشر"}</td>
          <td className="px-4 py-3">{transfer.createdByName}</td>
          <td className="px-4 py-3">{transfer.approvedByName}</td>
          <td className="px-4 py-3 tnum">{formatMoney(transfer.totalCost)}</td>
          <td className="px-4 py-3 text-muted">{new Date(transfer.createdAt).toLocaleString("ar-EG")}</td>
          <td className="px-4 py-3">
            <Link href={`/cafe/transfers/${transfer.id}`} aria-label={`عرض التحويل رقم ${transfer.id}`} title="عرض التحويل" className="inline-flex rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"><Eye className="size-4" /></Link>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function RequestStatus({ status }: { status: TransferRequestStatus }) {
  return <Badge tone={status === "approved" ? "success" : status === "rejected" ? "danger" : "neutral"}>{status === "approved" ? "معتمد" : status === "rejected" ? "مرفوض" : "قيد المراجعة"}</Badge>;
}

function Empty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center"><div className="mx-auto mb-3 w-fit text-muted">{icon}</div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted">{description}</p></div>;
}

function Summary({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value: string; danger?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4"><div className="rounded-lg bg-white/8 p-2">{icon}</div><div><p className="text-xs text-sidebar-ink">{label}</p><p className={`tnum mt-0.5 text-xl font-bold ${danger ? "text-accent" : ""}`}>{value}</p></div></div>;
}
