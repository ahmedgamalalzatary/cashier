import { cairoMidnight, HttpError } from "@cashier/server-core";
import type { AuthUser } from "@cashier/shared";
import { MAX_SHIFT_HOURS } from "@cashier/shared";
import type {
  AdminCloseShiftInput,
  CloseShiftInput,
  CorrectShiftInput,
  OpenShiftInput,
  ShiftAuditNoteInput,
} from "./shifts.schemas.js";
import type { ShiftsRepository } from "./shifts.repository.js";

function isDuplicateEntry(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function isDeadlock(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_LOCK_DEADLOCK"
  );
}

export const AUTO_CLOSE_NOTE =
  "أُغلقت تلقائياً بعد 16 ساعة دون عدّ الدرج";

const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 3_600_000;

export class ShiftsService {
  constructor(private repo: ShiftsRepository) {}

  /**
   * Closes every shift in this branch that has been open for MAX_SHIFT_HOURS.
   * The drawer was never counted, so the close records the expected cash only and
   * `closedAt` is capped at openedAt + MAX_SHIFT_HOURS: a shift left open for
   * three days must still report 16 worked hours, not 72. An admin enters the
   * counted cash later through the existing correction flow.
   */
  async autoCloseExpired(now = new Date()) {
    const cutoff = new Date(now.getTime() - MAX_SHIFT_MS);
    return this.repo.transaction(async (repo) => {
      const expired = await repo.findExpiredOpen(cutoff);
      let closed = 0;
      for (const row of expired) {
        const shift = await repo.findByIdForUpdate(row.id);
        if (!shift || shift.status !== "open") continue;
        const expectedCash = await this.expectedCashFor(repo, shift.id, shift.openingFloat);
        const closedAt = new Date(
          Math.min(now.getTime(), shift.openedAt.getTime() + MAX_SHIFT_MS),
        );
        await repo.close({
          id: row.id,
          closedByUserId: null,
          closedAt,
          actualCash: null,
          expectedCash,
          overShort: null,
        });
        await repo.createEvent({
          shiftId: row.id,
          action: "auto_close",
          actorUserId: null,
          note: AUTO_CLOSE_NOTE,
          openingFloat: shift.openingFloat,
          actualCash: null,
          expectedCash,
          overShort: null,
          occurredAt: closedAt,
        });
        closed += 1;
      }
      return closed;
    });
  }

  /** The same drawer arithmetic every close path uses. */
  private async expectedCashFor(
    repo: ShiftsRepository,
    id: number,
    openingFloat: string,
  ) {
    const totals = await repo.totals(id);
    const expected =
      toCents(openingFloat) +
      toCents(totals.sales) -
      toCents(totals.refunds) -
      toCents(totals.expenses);
    return fromCents(expected);
  }

  async open(data: OpenShiftInput, cashierUserId: number) {
    let id: number;
    try {
      id = await this.repo.transaction(async (repo) => {
        const cashier = await repo.findCashierForUpdate(cashierUserId);
        if (
          !cashier?.userIsActive ||
          !cashier.employeeId ||
          !cashier.employeeIsActive
        ) {
          throw new HttpError(409, "حساب الكاشير غير مرتبط بموظف نشط");
        }
        const openedAt = new Date();
        const openingFloat = data.openingFloat.toFixed(2);
        const shiftId = await repo.create({
          cashierUserId,
          employeeId: cashier.employeeId,
          openingFloat,
          openedAt,
        });
        await repo.createEvent({
          shiftId,
          action: "open",
          actorUserId: cashierUserId,
          note: null,
          openingFloat,
          occurredAt: openedAt,
        });
        return shiftId;
      });
    } catch (error) {
      if (isDuplicateEntry(error))
        throw new HttpError(409, "توجد وردية مفتوحة بالفعل");
      throw error;
    }
    return this.get(id);
  }

  async get(id: number) {
    const shift = await this.repo.findById(id);
    if (!shift) throw new HttpError(404, "الوردية غير موجودة");
    const [totals, events] = await Promise.all([
      this.repo.totals(id),
      this.repo.events(id),
    ]);
    return {
      ...shift,
      workedMinutes: workedMinutes(shift.openedAt, shift.closedAt, events),
      totals: {
        ordersCount: Number(totals.ordersCount),
        sales: totals.sales,
        discounts: totals.discounts,
        transferRequests: Number(totals.transferRequests),
        refunds: totals.refunds,
        expenses: totals.expenses,
        wasteEntries: Number(totals.wasteEntries),
      },
      events,
    };
  }

  async current(actor: AuthUser) {
    if (actor.role !== "cashier") return null;
    // Close an expired shift before answering, so the POS and the home screen
    // see "no shift open" instead of a stale one the cashier cannot close.
    await this.autoCloseExpired();
    const current = await this.repo.findCurrent(actor.id);
    if (!current) return null;
    return this.get(current.id);
  }

  async active() {
    const rows = await this.repo.activeIds();
    return Promise.all(rows.map((row) => this.get(row.id)));
  }

  async today(actor: AuthUser) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const rows = await this.repo.dayIds(
      cairoMidnight(day),
      cairoMidnight(next.toISOString().slice(0, 10)),
      actor.role === "cashier" ? actor.id : undefined,
    );
    return Promise.all(rows.map((row) => this.get(row.id)));
  }

  async list(actor: AuthUser, pagination = { limit: 100, offset: 0 }) {
    const rows = await this.repo.listIds(
      actor.role === "cashier" ? actor.id : undefined,
      pagination,
    );
    return Promise.all(rows.map((row) => this.get(row.id)));
  }

  async close(id: number, data: CloseShiftInput, cashierUserId: number) {
    try {
      await this.closeOnce(id, data, cashierUserId);
    } catch (error) {
      // a concurrent transfer request can deadlock the shift row —
      // MySQL asks the loser to restart, so retry once after it commits
      if (!isDeadlock(error)) throw error;
      await this.closeOnce(id, data, cashierUserId);
    }
    return this.get(id);
  }

  private closeOnce(id: number, data: CloseShiftInput, cashierUserId: number) {
    return this.repo.transaction(async (repo) => {
      const shift = await repo.findByIdForUpdate(id);
      if (!shift) throw new HttpError(404, "الوردية غير موجودة");
      if (shift.status !== "open")
        throw new HttpError(409, "الوردية مغلقة بالفعل");
      if (shift.cashierUserId !== cashierUserId)
        throw new HttpError(403, "لا يمكنك إغلاق وردية كاشير آخر");
      const totals = await repo.totals(id);
      const expected =
        toCents(shift.openingFloat) +
        toCents(totals.sales) -
        toCents(totals.refunds) -
        toCents(totals.expenses);
      const actual = BigInt(Math.round(data.actualCash * 100));
      const closedAt = new Date();
      const actualCash = fromCents(actual);
      const expectedCash = fromCents(expected);
      const overShort = fromCents(actual - expected);
      await repo.close({
        id,
        closedByUserId: cashierUserId,
        closedAt,
        actualCash,
        expectedCash,
        overShort,
      });
      await repo.createEvent({
        shiftId: id,
        action: "close",
        actorUserId: cashierUserId,
        note: null,
        openingFloat: shift.openingFloat,
        actualCash,
        expectedCash,
        overShort,
        occurredAt: closedAt,
      });
    });
  }

  async adminClose(
    id: number,
    data: AdminCloseShiftInput,
    adminUserId: number,
  ) {
    await this.repo.transaction(async (repo) => {
      const shift = await repo.findByIdForUpdate(id);
      if (!shift) throw new HttpError(404, "الوردية غير موجودة");
      if (shift.status !== "open")
        throw new HttpError(409, "الوردية مغلقة بالفعل");
      const totals = await repo.totals(id);
      const expected =
        toCents(shift.openingFloat) +
        toCents(totals.sales) -
        toCents(totals.refunds) -
        toCents(totals.expenses);
      const actual = BigInt(Math.round(data.actualCash * 100));
      const occurredAt = new Date();
      const expectedCash = fromCents(expected);
      const actualCash = fromCents(actual);
      const overShort = fromCents(actual - expected);
      await repo.close({
        id,
        closedByUserId: adminUserId,
        closedAt: occurredAt,
        actualCash,
        expectedCash,
        overShort,
      });
      await repo.createEvent({
        shiftId: id,
        action: "admin_close",
        actorUserId: adminUserId,
        note: data.note,
        openingFloat: shift.openingFloat,
        actualCash,
        expectedCash,
        overShort,
        occurredAt,
      });
    });
    return this.get(id);
  }

  async reopen(id: number, data: ShiftAuditNoteInput, adminUserId: number) {
    try {
      await this.repo.transaction(async (repo) => {
        const preview = await repo.findById(id);
        if (!preview) throw new HttpError(404, "الوردية غير موجودة");
        const cashier = await repo.findCashierForUpdate(preview.cashierUserId);
        if (
          !cashier?.userIsActive ||
          !cashier.employeeId ||
          !cashier.employeeIsActive
        ) {
          throw new HttpError(
            409,
            "لا يمكن إعادة فتح وردية لكاشير أو موظف موقوف",
          );
        }
        const shift = await repo.findByIdForUpdate(id);
        if (!shift) throw new HttpError(404, "الوردية غير موجودة");
        if (shift.status !== "closed")
          throw new HttpError(409, "الوردية مفتوحة بالفعل");
        const occurredAt = new Date();
        await repo.reopen(id);
        await repo.createEvent({
          shiftId: id,
          action: "reopen",
          actorUserId: adminUserId,
          note: data.note,
          actualCash: shift.actualCash,
          expectedCash: shift.expectedCash,
          overShort: shift.overShort,
          occurredAt,
        });
      });
    } catch (error) {
      if (isDuplicateEntry(error))
        throw new HttpError(409, "توجد وردية مفتوحة بالفعل");
      throw error;
    }
    return this.get(id);
  }

  async correct(id: number, data: CorrectShiftInput, adminUserId: number) {
    await this.repo.transaction(async (repo) => {
      const shift = await repo.findByIdForUpdate(id);
      if (!shift) throw new HttpError(404, "الوردية غير موجودة");
      // An auto-closed shift has no counted cash yet (actualCash is NULL); the
      // correction is exactly how an admin supplies it later.
      if (shift.status !== "closed")
        throw new HttpError(409, "يمكن تصحيح وردية مغلقة فقط");
      if (shift.actualCash === null && data.actualCash === undefined)
        throw new HttpError(409, "يمكن تصحيح وردية مغلقة فقط");
      const totals = await repo.totals(id);
      const openingFloat =
        data.openingFloat === undefined
          ? shift.openingFloat
          : data.openingFloat.toFixed(2);
      // an auto-closed shift arrives with actualCash null; the correction supplies it
      const actualCash =
        data.actualCash === undefined
          ? shift.actualCash!
          : data.actualCash.toFixed(2);
      const expected =
        toCents(openingFloat) +
        toCents(totals.sales) -
        toCents(totals.refunds) -
        toCents(totals.expenses);
      const overShort = toCents(actualCash) - expected;
      const expectedCash = fromCents(expected);
      const overShortText = fromCents(overShort);
      const occurredAt = new Date();
      await repo.correct({
        id,
        openingFloat,
        actualCash,
        expectedCash,
        overShort: overShortText,
      });
      await repo.createEvent({
        shiftId: id,
        action: "correction",
        actorUserId: adminUserId,
        note: data.note,
        openingFloat,
        actualCash,
        expectedCash,
        overShort: overShortText,
        occurredAt,
      });
    });
    return this.get(id);
  }
}

function toCents(value: string) {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (
    negative ? value.slice(1) : value
  ).split(".");
  const cents =
    BigInt(whole || "0") * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -cents : cents;
}

function fromCents(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n)
    .toString()
    .padStart(2, "0")}`;
}

function workedMinutes(
  openedAt: Date,
  closedAt: Date | null,
  events: Array<{ action: string; occurredAt: Date }>,
) {
  let segmentStartedAt: Date | null = openedAt;
  let workedMilliseconds = 0;
  for (const event of events) {
    if (
      (event.action === "close" ||
        event.action === "admin_close" ||
        event.action === "auto_close") &&
      segmentStartedAt
    ) {
      workedMilliseconds += Math.max(
        0,
        event.occurredAt.getTime() - segmentStartedAt.getTime(),
      );
      segmentStartedAt = null;
    } else if (event.action === "reopen") {
      segmentStartedAt = event.occurredAt;
    }
  }
  if (segmentStartedAt) {
    const end = closedAt ?? new Date();
    workedMilliseconds += Math.max(
      0,
      end.getTime() - segmentStartedAt.getTime(),
    );
  }
  return Math.floor(workedMilliseconds / 60_000);
}
