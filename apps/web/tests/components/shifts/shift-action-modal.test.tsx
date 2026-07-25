import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useStateMock } = vi.hoisted(() => ({
  useStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: useStateMock };
});
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/field", () => ({
  Field: () => null,
  TextAreaField: () => null,
}));
vi.mock("@/components/ui/modal", () => ({ Modal: () => null }));

import { ShiftActionModal } from "../../../src/components/shifts/shift-action-modal";

describe("shift action modal", () => {
  beforeEach(() => {
    useStateMock.mockReset();
  });

  it("does not submit a whitespace-only required audit note", async () => {
    const stateValues = ["", "", "   ", false, ""];
    useStateMock.mockImplementation(() => [stateValues.shift(), vi.fn()]);
    const onSubmit = vi.fn();

    const modal = ShiftActionModal({
      mode: "reopen",
      onClose: vi.fn(),
      onSubmit,
    }) as ReactElement<{
      children: ReactElement<{
        onSubmit: (event: { preventDefault: () => void }) => Promise<void>;
      }>;
    }>;
    const form = modal.props.children;

    await form.props.onSubmit({ preventDefault: vi.fn() });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a genuinely non-empty audit note in trimmed form", async () => {
    const stateValues = ["", "", "  valid note  ", false, ""];
    useStateMock.mockImplementation(() => [stateValues.shift(), vi.fn()]);
    const onSubmit = vi.fn();

    const modal = ShiftActionModal({
      mode: "reopen",
      onClose: vi.fn(),
      onSubmit,
    }) as ReactElement<{
      children: ReactElement<{
        onSubmit: (event: { preventDefault: () => void }) => Promise<void>;
      }>;
    }>;

    await modal.props.children.props.onSubmit({ preventDefault: vi.fn() });

    expect(onSubmit).toHaveBeenCalledWith({ note: "valid note" });
  });
});
