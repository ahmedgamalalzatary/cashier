"use client";

import { useState } from "react";
import type { Shift } from "@cashier/shared";
import { shiftAutoCloseWarning } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { ShiftActionModal } from "./shift-action-modal";
import { ShiftHistory } from "./shift-history";
import { closeShift, openShift } from "../../services/shifts-service";

export function CashierShiftControls({
  current,
  onChanged,
  disabled = false,
}: {
  current: Shift | null;
  onChanged: (current: Shift | null) => void;
  disabled?: boolean;
}) {
  const [action, setAction] = useState<
    { mode: "open" } | { mode: "close"; shift: Shift } | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const autoCloseWarning = shiftAutoCloseWarning(current);

  return (
    <div className="space-y-2">
      {autoCloseWarning && (
        <p
          role="alert"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-danger"
        >
          {autoCloseWarning.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
      <Button
        disabled={disabled}
        onClick={() =>
          setAction(
            current ? { mode: "close", shift: current } : { mode: "open" },
          )
        }
      >
        {current ? "إغلاق وعدّ الدرج" : "فتح وردية"}
      </Button>
      <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
        سجل وردياتي
      </Button>
      {action && (
        <ShiftActionModal
          mode={action.mode}
          shift={action.mode === "close" ? action.shift : undefined}
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            if (action.mode === "open") {
              const opened = await openShift(values.openingFloat!);
              onChanged(opened);
            } else {
              await closeShift(action.shift.id, values.actualCash!);
              onChanged(null);
            }
            setAction(null);
          }}
        />
      )}
      {historyOpen && (
        <Modal
          open
          title="سجل وردياتي"
          size="xl"
          onClose={() => setHistoryOpen(false)}
        >
          <ShiftHistory />
        </Modal>
      )}
      </div>
    </div>
  );
}
