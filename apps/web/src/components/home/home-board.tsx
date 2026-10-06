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
import { AdminMetrics } from "@/components/home/admin-metrics";
import { QuickActions } from "@/components/home/quick-actions";
import { ShiftTape } from "@/components/home/shift-tape";
import { Section } from "@/components/ui/section";
import { ErrorBanner, LoadingState } from "@/components/ui/states";
import { cairoClock, cairoDayLabel, cairoHour } from "@/lib/cairo-date";
import { attentionItems, greetingFor } from "@/models/home-model";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import { getCurrentShift, listTodayShifts } from "@/services/shifts-service";
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
          listTodayShifts(),
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

  const attention = attentionItems({
    role: user.role,
    mainStock: board.mainStock,
    cafeStock: board.cafeStock,
    requests: board.requests,
    suppliers: board.suppliers,
  });

  return (
    <div>
      <header className="mb-7">
        <p className="tnum text-sm text-muted">
          {cairoDayLabel(now)} · {cairoClock(now)}
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-[-0.01em]">
          {greetingFor(cairoHour(now))}، {user.name}
        </h1>
      </header>

      {error && <ErrorBanner className="mb-5">{error}</ErrorBanner>}

      {isAdmin && <AdminMetrics />}

      {loading ? (
        <LoadingState label="جارِ تحميل حالة اليوم…" />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:gap-8">
          <ShiftTape
            role={user.role}
            current={board.current}
            shifts={board.shifts}
            onChanged={(current) => {
              setBoard((previous) => ({ ...previous, current }));
              void load();
            }}
          />

          <div className="space-y-6">
            <Section title="ابدأ من هنا" bodyClassName="p-0">
              <QuickActions role={user.role} />
            </Section>

            <Section title="يحتاج انتباهك" bodyClassName="p-0">
              <AttentionQueue items={attention} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
