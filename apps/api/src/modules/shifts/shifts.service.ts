import { HttpError } from "../../middleware/error.js";
import type { AuthUser } from "@cashier/shared";
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

export class ShiftsService {
  constructor(private repo: ShiftsRepository) {}

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
        expenses: "0.00",
        wasteEntries: Number(totals.wasteEntries),
      },
      events,
    };
  }

  async current(actor: AuthUser) {
    const current = await this.repo.findCurrent();
    if (!current) return null;
    if (actor.role === "cashier" && current.cashierUserId !== actor.id) {
      return { occupied: true as const };
    }
    return this.get(current.id);
  }

  async list(actor: AuthUser) {
    const rows = await this.repo.listIds(
      actor.role === "cashier" ? actor.id : undefined,
    );
    return Promise.all(rows.map((row) => this.get(row.id)));
  }

  async close(id: number, data: CloseShiftInput, cashierUserId: number) {
    await this.repo.transaction(async (repo) => {
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
        toCents(totals.refunds);
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
    return this.get(id);
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
        toCents(totals.refunds);
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
      if (shift.status !== "closed" || shift.actualCash === null)
        throw new HttpError(409, "يمكن تصحيح وردية مغلقة فقط");
      const totals = await repo.totals(id);
      const openingFloat =
        data.openingFloat === undefined
          ? shift.openingFloat
          : data.openingFloat.toFixed(2);
      const actualCash =
        data.actualCash === undefined
          ? shift.actualCash
          : data.actualCash.toFixed(2);
      const expected =
        toCents(openingFloat) + toCents(totals.sales) - toCents(totals.refunds);
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
      (event.action === "close" || event.action === "admin_close") &&
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
