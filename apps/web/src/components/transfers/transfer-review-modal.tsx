"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  InventoryStockRow,
  TransferRequestDetail,
} from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  approveTransferRequest,
  getTransferRequest,
  rejectTransferRequest,
} from "@/services/transfers-service";

export function TransferReviewModal({
  requestId,
  isAdmin,
  mainStock,
  onClose,
  onSaved,
}: {
  requestId: number;
  isAdmin: boolean;
  mainStock: InventoryStockRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [request, setRequest] = useState<TransferRequestDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stockByItem = useMemo(
    () => new Map(mainStock.map((row) => [row.itemId, row])),
    [mainStock],
  );

  useEffect(() => {
    getTransferRequest(requestId)
      .then((row) => {
        setRequest(row);
        setQuantities(
          Object.fromEntries(
            row.lines.map((line) => [line.itemId, String(Number(line.quantity))]),
          ),
        );
      })
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل طلب التحويل",
        ),
      );
  }, [requestId]);

  async function approve() {
    if (!request) return;
    setSaving(true);
    setError("");
    try {
      await approveTransferRequest(
        request.id,
        request.lines.map((line) => ({
          itemId: line.itemId,
          quantity: Number(quantities[line.itemId]),
        })),
      );
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر اعتماد الطلب");
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!request || !reason.trim()) {
      setError("اكتب سبب الرفض أولاً");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await rejectTransferRequest(request.id, reason.trim());
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر رفض الطلب");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`طلب تحويل #${requestId}`}>
      {!request && !error ? (
        <p className="text-sm text-muted">جارِ تحميل الطلب…</p>
      ) : request ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-paper/70 p-3 text-sm">
            <div>
              <p className="font-medium">{request.requestedByName}</p>
              <p className="text-xs text-muted">
                {new Date(request.createdAt).toLocaleString("ar-EG")}
              </p>
            </div>
            <StatusBadge status={request.status} />
          </div>

          <div className="max-h-[38vh] space-y-3 overflow-y-auto pe-1">
            {request.lines.map((line) => {
              const stock = stockByItem.get(line.itemId);
              return (
                <div key={line.id} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex justify-between gap-3">
                    <p className="font-medium">{line.itemName}</p>
                    <span className="text-xs text-muted">
                      المطلوب: {Number(line.quantity).toLocaleString("ar-EG", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {line.stockUnit}
                    </span>
                  </div>
                  {isAdmin && request.status === "pending" && (
                    <Field
                      label={`الكمية المعتمدة (${line.stockUnit})`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      max={Math.max(0, Number(stock?.quantity ?? 0))}
                      value={quantities[line.itemId] ?? ""}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.itemId]: event.target.value,
                        }))
                      }
                      dir="ltr"
                    />
                  )}
                  {isAdmin && request.status === "pending" && (
                    <p className="mt-2 text-xs text-muted">
                      المتاح في الرئيسي: {Number(stock?.quantity ?? 0).toLocaleString("ar-EG", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {line.stockUnit}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg bg-paper/60 p-3 text-sm">
            <span className="text-xs text-muted">ملاحظات الطلب</span>
            <p className="mt-1">{request.notes || "لا توجد ملاحظات"}</p>
          </div>

          {request.status === "rejected" && (
            <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
              سبب الرفض: {request.rejectionReason}
            </p>
          )}

          {isAdmin && request.status === "pending" && (
            <TextAreaField
              label="سبب الرفض"
              placeholder="مطلوب عند رفض الطلب"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={onClose}>
              إغلاق
            </Button>
            {isAdmin && request.status === "pending" && (
              <>
                <Button variant="danger" onClick={reject} disabled={saving}>
                  رفض الطلب
                </Button>
                <Button onClick={approve} disabled={saving}>
                  اعتماد ونقل الرصيد
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-danger">{error}</p>
      )}
    </Modal>
  );
}

function StatusBadge({ status }: { status: TransferRequestDetail["status"] }) {
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
      {status === "approved" ? "معتمد" : status === "rejected" ? "مرفوض" : "قيد المراجعة"}
    </Badge>
  );
}
