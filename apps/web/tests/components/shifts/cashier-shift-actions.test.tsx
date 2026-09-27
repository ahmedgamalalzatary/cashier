import type { ReactElement } from "react";
import type { Shift } from "@cashier/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../src/lib/api";
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
vi.mock("../../../src/lib/api", () => ({ api: vi.fn() }));
vi.mock(
  "@/components/ui/button",
  async () => import("../../../src/components/ui/button"),
);
vi.mock(
  "@/components/ui/field",
  async () => import("../../../src/components/ui/field"),
);
vi.mock(
  "@/components/ui/modal",
  async () => import("../../../src/components/ui/modal"),
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
function actionModal(element: ReturnType<typeof render>) {
  return element.props.children.find(
    (child) => child?.type === ShiftActionModal,
  ) as ReactElement<{
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
    (controls.props.children[0].props as { onClick: () => void }).onClick();
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
    (controls.props.children[0].props as { onClick: () => void }).onClick();
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
    (controls.props.children[0].props as { onClick: () => void }).onClick();
    await expect(
      actionModal(render(selected, changed)).props.onSubmit({
        actualCash: 120,
      }),
    ).rejects.toThrow("Already closed");
    expect(changed).not.toHaveBeenCalled();
  });
});
