"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, ClipboardList, Eye } from "lucide-react";
import type {
  InventoryStockRow,
  TransferRequestStatus,
  TransferRequestSummary,
  TransferSummary,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { TransferFormModal } from "@/components/transfers/transfer-form-modal";
import { TransferReviewModal } from "@/components/transfers/transfer-review-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import {
  listTransferRequests,
  listTransfers,
} from "@/services/transfers-service";

type FormMode = "request" | "direct" | null;
type TransferTab = "requests" | "history";

function RequestStatus({ status }: { status: TransferRequestStatus }) {
  return (
    <Badge
      tone={
        status === "approved"
          ? "success"
          : status === "rejected"
            ? "danger"
            : "neutral"
      }
    >
      {status === "approved"
        ? "معتمد"
        : status === "rejected"
          ? "مرفوض"
          : "قيد المراجعة"}
    </Badge>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تحميل التحويلات…" />}>
      <TransfersView />
    </Suspense>
  );
}

function TransfersView() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedNew = searchParams.get("new");
  const requestedInvoice = searchParams.get("invoice");
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [mainStock, setMainStock] = useState<InventoryStockRow[]>([]);
  const [requests, setRequests] = useState<TransferRequestSummary[]>([]);
  const [transfers, setTransfers] = useState<TransferSummary[]>([]);
  const [tab, setTab] = useState<TransferTab>(() =>
    requestedTab === "history" ? "history" : "requests",
  );
  // The session is already resolved before this page renders, so the role is
  // known here: `direct` is an admin-only capability (T1).
  const [formMode, setFormMode] = useState<FormMode>(() => {
    if (isAdmin && searchParams.get("direct") === "1") return "direct";
    return requestedNew === "request" ? "request" : null;
  });
  const [directInvoiceId] = useState<number | null>(() => {
    const invoiceId = Number(requestedInvoice);
    return isAdmin && invoiceId > 0 ? invoiceId : null;
  });
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
              : "تعذر تحميل التحويلات",
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

  const pendingRequests = requests.filter(
    (request) => request.status === "pending",
  ).length;

  // Intents from other pages (?tab=history, ?new=request, ?direct=1&invoice=id)
  // are read once as initial state, then cleared so a refresh does not reopen
  // the form.
  useEffect(() => {
    if (requestedTab !== "history" && !requestedNew && !requestedInvoice) {
      return;
    }
    router.replace("/transfers");
  }, [requestedInvoice, requestedNew, requestedTab, router, searchParams]);

  function saved() {
    setFormMode(null);
    setReviewingId(null);
    setReloadKey((current) => current + 1);
  }

  const requestColumns: DataColumn<TransferRequestSummary>[] = [
    {
      key: "id",
      header: "الطلب",
      mobile: "primary",
      cell: (request) => (
        <span className="tnum font-medium">#{request.id}</span>
      ),
    },
    {
      key: "by",
      header: "صاحب الطلب",
      cell: (request) => request.requestedByName,
    },
    {
      key: "lines",
      header: "الأصناف",
      numeric: true,
      cell: (request) => request.lineCount,
    },
    {
      key: "at",
      header: "وقت الطلب",
      cell: (request) => (
        <span className="text-muted">
          {new Date(request.createdAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (request) => <RequestStatus status={request.status} />,
    },
  ];

  const transferColumns: DataColumn<TransferSummary>[] = [
    {
      key: "id",
      header: "التحويل",
      mobile: "primary",
      cell: (transfer) => (
        <span className="tnum font-medium">#{transfer.id}</span>
      ),
    },
    {
      key: "source",
      header: "المصدر",
      cell: (transfer) =>
        transfer.requestId ? `طلب #${transfer.requestId}` : "تحويل مباشر",
    },
    {
      key: "by",
      header: "صاحب الطلب",
      cell: (transfer) => transfer.createdByName,
    },
    {
      key: "approved",
      header: "اعتمده",
      cell: (transfer) => transfer.approvedByName,
    },
    {
      key: "cost",
      header: "التكلفة",
      numeric: true,
      cell: (transfer) => formatMoney(transfer.totalCost),
    },
    {
      key: "at",
      header: "الوقت",
      cell: (transfer) => (
        <span className="text-muted">
          {new Date(transfer.createdAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="التحويلات"
        description="طلبات نقل الكميات من المخزن الرئيسي إلى الكافيه واعتمادها وسجلها."
        actions={
          <>
            {isAdmin && (
              <Button variant="ghost" onClick={() => setFormMode("direct")}>
                <ArrowLeftRight className="size-4" /> تحويل مباشر
              </Button>
            )}
            <Button onClick={() => setFormMode("request")}>
              <ClipboardList className="size-4" /> طلب تحويل
            </Button>
          </>
        }
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <Tabs
        items={[
          {
            id: "requests",
            label: "طلبات التحويل",
            badge: pendingRequests,
          },
          { id: "history", label: "سجل التحويلات" },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="أقسام التحويلات"
        className="mb-5"
      />

      {loading ? (
        <LoadingState label="جارِ تحميل التحويلات…" />
      ) : tab === "requests" ? (
        <DataTable
          caption="طلبات التحويل"
          rows={requests}
          rowKey={(request) => request.id}
          columns={requestColumns}
          empty={
            <EmptyState
              icon={<ClipboardList className="size-8" />}
              title="لا توجد طلبات تحويل"
              description="طلبات فريق الكافيه ستظهر هنا للجميع لتجنب تكرار الاحتياج."
            />
          }
          actions={(request) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReviewingId(request.id)}
            >
              <Eye className="size-4" /> عرض
            </Button>
          )}
        />
      ) : (
        <DataTable
          caption="سجل التحويلات"
          rows={transfers}
          rowKey={(transfer) => transfer.id}
          columns={transferColumns}
          empty={
            <EmptyState
              icon={<ArrowLeftRight className="size-8" />}
              title="لم تُنفذ تحويلات بعد"
              description="التحويلات المعتمدة والمباشرة ستظهر هنا كوثائق مخزنية ثابتة."
            />
          }
          actions={(transfer) => (
            <Link
              href={`/transfers/detail?id=${transfer.id}`}
              aria-label={`عرض التحويل رقم ${transfer.id}`}
              title="عرض التحويل"
              className="inline-flex rounded-lg p-2 text-muted transition-colors hover:bg-line/50 hover:text-ink"
            >
              <Eye className="size-4" />
            </Link>
          )}
        />
      )}

      {/* wait for stock: an invoice opened from the URL computes availability once */}
      {formMode && !loading && (
        <TransferFormModal
          mode={formMode}
          items={stock}
          mainStock={mainStock}
          initialInvoiceId={formMode === "direct" ? (directInvoiceId ?? undefined) : undefined}
          onClose={() => setFormMode(null)}
          onSaved={saved}
        />
      )}
      {reviewingId !== null && (
        <TransferReviewModal
          requestId={reviewingId}
          isAdmin={Boolean(isAdmin)}
          mainStock={mainStock}
          onClose={() => setReviewingId(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
