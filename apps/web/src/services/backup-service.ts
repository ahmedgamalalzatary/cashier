import { api } from "@cashier/web-core/lib/api";

export type BackupStatus = {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  pending: number;
};

export type UploadResult = { uploaded: number; pending: number };

/** What the backup card shows for this PC (plan 10.3). */
export function readBackupStatus() {
  return api<BackupStatus>("/api/sync/status");
}

/** The admin's "Upload now" button; it never blocks selling. */
export function uploadNow() {
  return api<UploadResult>("/api/sync/upload-now", { method: "POST" });
}

/** Recovery: queue every row again and start sending (plan 10.4). */
export function resendEverything() {
  return api<UploadResult & { queued: number }>("/api/sync/resend-all", {
    method: "POST",
  });
}