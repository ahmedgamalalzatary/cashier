"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CurrentShift,
  InventoryStockRow,
  Shift,
  Supplier,
  TransferRequestSummary,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { AttentionQueue } from "@/components/home/attention-queue";
import { QuickActions } from "@/components/home/quick-actions";
import { ShiftTape } from "@/components/home/shift-tape";
import { cairoClock, cairoDayLabel, cairoHour } from "@/lib/cairo-date";
import { attentionItems, greetingFor } from "@/models/home-model";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import { getCurrentShift, listShifts } from "@/services/shifts-service";
import { listSuppliers } from "@/services/suppliers-service";
import { listTransferRequests } from "@/services/transfers-service";

type Board = {
  current: CurrentShift | null;
  shifts: Shift[];
  cafeStock: InventoryStockRow[];
  mainStock: InventoryStockRow[];
  requests: TransferRequestSummary[];
  suppliers: Supplier[];
};

const empty: Board = {
  current: null,
  shifts: [],
  cafeStock: [],
  mainStock: [],
  requests: [],
  suppliers: [],
};

export function HomeBoard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [board, setBoard] = useState<Board>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const [current, shifts, cafeStock, requests, mainStock, suppliers] =
        await Promise.all([
          getCurrentShift(),
          listShifts(),
          getCafeWarehouseStock(),
          listTransferRequests(),
          isAdmin ? getMainWarehouseStock() : Promise.resolve([]),
          isAdmin ? listSuppliers() : Promise.resolve([]),
        ]);
      setBoard({ current, shifts, cafeStock, requests, mainStock, suppliers });
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل حالة اليوم",
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(tick);
  }, []);

  if (!user) return null;

  return (
    <div>
      <header className="mb-7">
        <p className="text-sm text-muted">
          {cairoDayLabel(now)} · {cairoClock(now)}
        </p>
        <h1 className="mt-1.5 text-3xl font-bold">
          {greetingFor(cairoHour(now))}، {user.name}
        </h1>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-muted">جارِ تحميل حالة اليوم…</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:gap-8">
          <ShiftTape
            role={user.role}
            current={board.current}
            shifts={board.shifts}
          />

          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-base font-bold">ابدأ من هنا</h2>
              <QuickActions role={user.role} />
            </section>

            <section>
              <h2 className="mb-3 text-base font-bold">يحتاج انتباهك</h2>
              <AttentionQueue
                items={attentionItems({
                  role: user.role,
                  mainStock: board.mainStock,
                  cafeStock: board.cafeStock,
                  requests: board.requests,
                  suppliers: board.suppliers,
                })}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
