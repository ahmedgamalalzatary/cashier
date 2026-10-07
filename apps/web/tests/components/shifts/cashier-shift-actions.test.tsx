import type { ReactElement } from "react";
import type { Shift } from "@cashier/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import { Button } from "@cashier/web-core/components/ui/button";
import { CashierShiftControls } from "../../../src/components/shifts/cashier-shift-controls";
import { ShiftActionModal } from "../../../src/components/shifts/shift-action-modal";
import { shiftFixture } from "../../fixtures/shift";

const { state, cursor } = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: { value: 0 },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = cursor.value++;
    if (index >= state.length) state[index] = initial;
    return [
      state[index],
      (value: unknown) => {
        state[index] = value;
      },
    ];
  },
}));
vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));
vi.mock(
  "@cashier/web-core/components/ui/button",
  async () => import("@cashier/web-core/components/ui/button"),
);
vi.mock(
  "@cashier/web-core/components/ui/field",
  async () => import("@cashier/web-core/components/ui/field"),
);
vi.mock(
  "@cashier/web-core/components/ui/modal",
  async () => import("@cashier/web-core/components/ui/modal"),
);

function render(
  current: Shift | null,
  onChanged: (shift: Shift | null) => void,
) {
  cursor.value = 0;
  return CashierShiftControls({ current, onChanged }) as ReactElement<{
    children: ReactElement[];
  }>;
}
// The controls render an optional auto-close banner next to the buttons, so
// look nodes up by type instead of by position.
function findNode(
  element: ReactElement<Record<string, unknown>>,
  type: unknown,
): ReactElement<Record<string, unknown>> | undefined {
  const children = (element?.props?.children ?? []) as ReactElement[];
  const list = Array.isArray(children) ? children : [children as ReactElement];
  for (const child of list) {
    if (!child || typeof child !== "object" || !child.props) continue;
    if (child.type === type) return child as ReactElement<Record<string, unknown>>;
    const nested = findNode(child as ReactElement<Record<string, unknown>>, type);
    if (nested) return nested;
  }
  return undefined;
}
function openButton(element: ReturnType<typeof render>) {
  const button = findNode(element, Button);
  if (!button) throw new Error("shift button not rendered");
  return button as unknown as ReactElement<{ onClick: () => void }>;
}
function actionModal(element: ReturnType<typeof render>) {
  return findNode(element, ShiftActionModal) as unknown as ReactElement<{
    onSubmit: (values: {
      openingFloat?: number;
      actualCash?: number;
    }) => Promise<void>;
  }>;
}

describe("cashier shift actions used by Home and POS", () => {
  beforeEach(() => {
    state.length = 0;
    vi.mocked(api).mockReset();
  });
  it("opens with the counted float and updates the parent current shift", async () => {
    const opened = shiftFixture();
    vi.mocked(api).mockResolvedValue(opened);
    const changed = vi.fn();
    const controls = render(null, changed);
    openButton(controls).props.onClick();
    await actionModal(render(null, changed)).props.onSubmit({
      openingFloat: 125.5,
    });
    expect(api).toHaveBeenCalledWith("/api/shifts/open", {
      method: "POST",
      body: '{"openingFloat":125.5}',
    });
    expect(changed).toHaveBeenCalledWith(opened);
  });
  it("closes the selected shift even if a refresh clears the current shift while counting", async () => {
    const selected = shiftFixture();
    vi.mocked(api).mockResolvedValue(shiftFixture({ status: "closed" }));
    const changed = vi.fn();
    const controls = render(selected, changed);
    openButton(controls).props.onClick();
    await actionModal(render(null, changed)).props.onSubmit({
      actualCash: 120,
    });
    expect(api).toHaveBeenCalledWith("/api/shifts/41/close", {
      method: "POST",
      body: '{"actualCash":120}',
    });
    expect(changed).toHaveBeenCalledWith(null);
  });
  it("leaves the parent shift unchanged when closing fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Already closed"));
    const selected = shiftFixture();
    const changed = vi.fn();
    const controls = render(selected, changed);
    openButton(controls).props.onClick();
    await expect(
      actionModal(render(selected, changed)).props.onSubmit({
        actualCash: 120,
      }),
    ).rejects.toThrow("Already closed");
    expect(changed).not.toHaveBeenCalled();
  });
});
describe("cashier auto-close warning", () => {
  beforeEach(() => {
    state.length = 0;
    vi.mocked(api).mockReset();
  });

  it("stays silent for a young shift", () => {
    const controls = render(shiftFixture({ workedMinutes: 60 }), vi.fn());
    expect(JSON.stringify(controls.props)).not.toContain("role");
  });

  it("warns an hour before the system closes the shift", () => {
    const controls = render(shiftFixture({ workedMinutes: 15 * 60 }), vi.fn());
    const alert = findNode(controls, "p");
    expect(alert).toBeDefined();
    expect(alert?.props).toMatchObject({ role: "alert" });
    expect(alert?.props.children).toContain("ستُغلق ورديتك تلقائياً");
  });

  it("never warns with no open shift", () => {
    expect(findNode(render(null, vi.fn()), "p")).toBeUndefined();
  });
});