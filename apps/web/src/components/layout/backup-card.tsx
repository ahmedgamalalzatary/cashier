"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { readSession } from "@cashier/web-core/lib/auth";
import { cairoCalendarDate, cairoClock } from "@cashier/web-core/lib/cairo-date";
import {
  DATA_CHANGED_EVENT,
  readBackupStatus,
  resendEverything,
  uploadNow,
  type BackupStatus,
} from "@/services/backup-service";

export type { BackupStatus };

export function BackupCardView({
  status,
  uploading,
  onUploadNow,
  onResendAll,
  confirm = () =>
    typeof window === "undefined" ||
    window.confirm(
      "سيتم استبدال النسخة الاحتياطية على الموقع ببيانات هذا الجهاز. البيانات غير الموجودة هنا ستُزال من النسخة على الموقع. هل تريد المتابعة؟",
    ),
}: {
  status: BackupStatus;
  uploading: boolean;
  onUploadNow: () => void;
  /** The recovery tool: queue every row again (plan 10.4). */
  onResendAll?: () => void;
  confirm?: () => boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">
      <div>
        <p className="font-medium">
          {status.lastSuccessAt
            ? `تم آخر رفع للنسخة الاحتياطية ${cairoCalendarDate(new Date(status.lastSuccessAt))} ${cairoClock(new Date(status.lastSuccessAt))}`
            : "لم يتم رفع نسخة احتياطية بعد"}
        </p>
        <p className="text-muted">
          {status.pending > 0
            ? `${status.pending} تغيير بانتظار الرفع`
            : "لا توجد تغييرات بانتظار الرفع"}
        </p>
        {status.lastError && (
          <p className="mt-1 text-danger">{status.lastError}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onResendAll && (
          <button
            type="button"
            onClick={() => {
              if (confirm()) onResendAll();
            }}
            disabled={uploading}
            className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:bg-line/50 disabled:opacity-60"
          >
            إعادة الإرسال بالكامل
          </button>
        )}
        <button
          type="button"
          onClick={onUploadNow}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-strong disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CloudUpload className="size-4" />
          )}
          {uploading ? "جارٍ الرفع…" : "رفع الآن"}
        </button>
      </div>
    </div>
  );
}

/**
 * Admins see how the online backup is doing and can start one now (plan 10.3).
 * A failure is shown plainly; it never blocks selling.
 */
export function BackupCard(): ReactNode {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = readSession()?.user.role === "admin";

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setStatus(await readBackupStatus());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر قراءة حالة الرفع",
      );
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    // Saves made on this screen announce themselves, so the pending count
    // follows them at once; focus and a short poll cover background work. The
    // first read happens in an event-free async task like the update banner's.
    const timer = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 15_000);
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [isAdmin, refresh]);

  if (!isAdmin) return null;
  if(!status) return error ? (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm">
      <p role="alert" className="text-danger">{error}</p>
      <button type="button" onClick={()=>void refresh()} className="mt-2 rounded border border-line px-3 py-1.5">إعادة المحاولة</button>
    </div>
  ) : null;

  const run = (work: Promise<unknown>, fallback: string) => {
    setUploading(true);
    setError(null);
    void work
      .then(() => refresh())
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : fallback),
      )
      .finally(() => setUploading(false));
  };

  return (
    <BackupCardView
      status={{ ...status, lastError: error ?? status.lastError }}
      uploading={uploading}
      onUploadNow={() => run(uploadNow(), "تعذر رفع النسخة الاحتياطية")}
      onResendAll={() =>
        run(resendEverything(), "تعذر إعادة إرسال كل البيانات")
      }
    />
  );
}
