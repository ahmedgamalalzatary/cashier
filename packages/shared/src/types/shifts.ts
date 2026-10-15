/**
 * A shift left open for this long is closed by the system. The drawer was never
 * counted, so the close records the expected cash only and an admin enters the
 * counted cash later with the existing correction flow.
 */
export const MAX_SHIFT_HOURS = 16;

/**
 * A shift is warned about this many minutes before the system closes it: a
 * 16 hour shift starts warning at 15 hours.
 */
export const SHIFT_WARNING_MINUTES = 60;

export type ShiftTotals = {
  ordersCount: number;
  sales: string;
  discounts: string;
  transferRequests: number;
  refunds: string;
  expenses: string;
  wasteEntries: number;
};

export type ShiftEventAction =
  "open" | "close" | "admin_close" | "auto_close" | "reopen" | "correction";

export type ShiftEvent = {
  id: string;
  action: ShiftEventAction;
  actorUserId: string | null;
  note: string | null;
  openingFloat: string | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  occurredAt: string;
};

export type Shift = {
  id: string;
  status: "open" | "closed";
  cashierUserId: string;
  employeeId: string;
  cashierName: string;
  openingFloat: string;
  openedAt: string;
  closedAt: string | null;
  closedByUserId: string | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  workedMinutes: number;
  /** Current continuous open segment; absent on older API responses. */
  currentSegmentMinutes?: number;
  totals: ShiftTotals;
  events: ShiftEvent[];
};

export type CurrentShift = Shift;
