import { afterEach, describe, expect, it, vi } from "vitest";
import { DATA_CHANGED_EVENT } from "@cashier/web-core/lib/api";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => (() => void) | void>,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] = value;
      },
    ];
  },
  useCallback: (fn: unknown) => fn,
  // first render collects initial effects; a rerender appends the new ones
  useEffect: (fn: () => void | (() => void)) => {
    hooks.effects.push(fn);
  },
}));
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));
vi.mock("@cashier/web-core/lib/cairo-date", () => ({
  cairoCalendarDate: () => "2026-09",
}));
const service = vi.hoisted(() => ({
  getSalaryMonth: vi.fn(async () => ({
    month: "2026-09",
    employees: [],
    advances: [],
    adjustments: [],
    payments: [],
  })),
}));
vi.mock("../../../src/services/salaries-service", () => ({ ...service }));

import { default as SalariesTab } from "../../../src/components/salaries/salaries-tab";

// useState order: month, data, employeeId, kind, amount, entryDate, note,
// loading, saving, error, paying, payingError, logging
function seededState() {
  hooks.state = [
    "2026-09",
    { month: "2026-09", employees: [], advances: [], adjustments: [], payments: [] },
    "",
    "advance",
    "",
    "2026-09-01",
    "",
    false,
    false,
    "",
    null,
    "",
    false,
  ];
}

function renderTab(active: boolean) {
  const before = hooks.effects.length;
  SalariesTab({ active });
  return hooks.effects.slice(before);
}

afterEach(() => {
  vi.unstubAllGlobals();
  hooks.state = [];
  hooks.cursor = 0;
  hooks.effects = [];
  service.getSalaryMonth.mockClear();
});

describe("salaries tab freshness", () => {
  it("reloads the month whenever the salaries tab becomes active", async () => {
    const window = Object.assign(new EventTarget(), { setTimeout: (fn: () => void) => (fn(), 0) });
    vi.stubGlobal("window", window);
    seededState();
    hooks.cursor = 0;
    const initialEffects = renderTab(false);
    initialEffects.forEach((effect) => effect?.());
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getSalaryMonth).toHaveBeenCalledTimes(1);

    const rerendered = renderTab(true);
    // the effects re-registered by this render; the activation effect is the
    // middle one of the three (initial-load, activation, write-listener)
    rerendered[Math.floor(rerendered.length / 2)]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getSalaryMonth).toHaveBeenCalledTimes(2);
  });

  it("reloads when any write elsewhere announces itself", async () => {
    const window = Object.assign(new EventTarget(), { setTimeout: (fn: () => void) => (fn(), 0) });
    vi.stubGlobal("window", window);
    seededState();
    hooks.cursor = 0;
    const effects = renderTab(false);
    effects.forEach((effect) => effect?.());
    await Promise.resolve();
    await Promise.resolve();
    // initial load + the (inactive) activation effect is a no-op
    const before = service.getSalaryMonth.mock.calls.length;
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getSalaryMonth).toHaveBeenCalledTimes(before + 1);
  });
});
