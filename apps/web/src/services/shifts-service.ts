import type { CurrentShift, Shift } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export const listShifts = (pagination?: { limit: number; offset: number }) =>
  api<Shift[]>(
    pagination
      ? `/api/shifts?limit=${pagination.limit}&offset=${pagination.offset}`
      : "/api/shifts",
  );
export const listActiveShifts = () => api<Shift[]>("/api/shifts/active");
export const listTodayShifts = () => api<Shift[]>("/api/shifts/today");
export const getCurrentShift = () =>
  api<CurrentShift | null>("/api/shifts/current");

export const openShift = (openingFloat: number) =>
  api<Shift>("/api/shifts/open", {
    method: "POST",
    body: JSON.stringify({ openingFloat }),
  });

export const closeShift = (id: string, actualCash: number) =>
  api<Shift>(`/api/shifts/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ actualCash }),
  });

export const adminCloseShift = (
  id: string,
  body: { actualCash: number; note: string },
) =>
  api<Shift>(`/api/shifts/${id}/admin-close`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const reopenShift = (id: string, note: string) =>
  api<Shift>(`/api/shifts/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

export const correctShift = (
  id: string,
  body: { openingFloat?: number; actualCash?: number; note: string },
) =>
  api<Shift>(`/api/shifts/${id}/correction`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
