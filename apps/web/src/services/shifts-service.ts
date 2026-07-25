import type { CurrentShift, Shift } from "@cashier/shared";
import { api } from "../lib/api";

export const listShifts = () => api<Shift[]>("/api/shifts");
export const getCurrentShift = () =>
  api<CurrentShift | null>("/api/shifts/current");

export const openShift = (openingFloat: number) =>
  api<Shift>("/api/shifts/open", {
    method: "POST",
    body: JSON.stringify({ openingFloat }),
  });

export const closeShift = (id: number, actualCash: number) =>
  api<Shift>(`/api/shifts/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ actualCash }),
  });

export const adminCloseShift = (
  id: number,
  body: { actualCash: number; note: string },
) =>
  api<Shift>(`/api/shifts/${id}/admin-close`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const reopenShift = (id: number, note: string) =>
  api<Shift>(`/api/shifts/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

export const correctShift = (
  id: number,
  body: { openingFloat?: number; actualCash?: number; note: string },
) =>
  api<Shift>(`/api/shifts/${id}/correction`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
