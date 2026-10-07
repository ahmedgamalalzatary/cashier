import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "../../../src/components/ui/confirm-dialog";

describe("confirmation dismissal", () => {
  it.each([true, false])(
    "allows modal dismissal only while idle (busy=%s)",
    (busy) => {
      let cancelled = false;
      const dialog = ConfirmDialog({
        open: true,
        title: "Confirm",
        busy,
        onConfirm: () => undefined,
        onCancel: () => {
          cancelled = true;
        },
      });
      dialog.props.onClose();
      expect(cancelled).toBe(!busy);
    },
  );
});
