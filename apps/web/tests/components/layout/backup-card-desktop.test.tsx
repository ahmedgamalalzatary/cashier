import { afterEach, describe, expect, it, vi } from "vitest";

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
  useEffect: (fn: () => void) => {
    hooks.effects.push(fn);
  },
}));
vi.mock("@cashier/web-core/lib/auth", () => ({
  readSession: () => ({
    token: "test",
    user: { id: "admin", name: "Admin", username: "admin", role: "admin" },
  }),
}));
const service = vi.hoisted(() => ({
  readBackupStatus: vi.fn(async () => ({
    lastSuccessAt: null,
    lastAttemptAt: null,
    lastError: null,
    pending: 0,
  })),
  uploadNow: vi.fn(),
  resendEverything: vi.fn(),
}));
vi.mock("../../../src/services/backup-service", () => ({
  ...service,
  DATA_CHANGED_EVENT: "cashier:data-changed",
}));

import { BackupCard } from "../../../src/components/layout/backup-card";

type BrowserWindow = EventTarget & { __TAURI_INTERNALS__?: unknown };

function stubWindow(desktop: boolean) {
  const page = new EventTarget() as BrowserWindow;
  if (desktop) page.__TAURI_INTERNALS__ = {};
  vi.stubGlobal("window", page);
  return page;
}

function runEffect() {
  hooks.effects[0]?.();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  hooks.state = [];
  hooks.cursor = 0;
  hooks.effects = [];
  service.readBackupStatus.mockClear();
});

describe("backup bar visibility", () => {
  it("renders nothing and never asks about sync status outside the desktop", async () => {
    vi.useFakeTimers();
    stubWindow(false);
    BackupCard();
    runEffect();
    await vi.advanceTimersByTimeAsync(60_000);
    const markup = renderToStaticMarkupSafe(BackupCard());
    expect(service.readBackupStatus).not.toHaveBeenCalled();
    expect(markup).toBeNull();
  });

  it("still polls and shows the bar inside the desktop shell", async () => {
    vi.useFakeTimers();
    stubWindow(true);
    const { renderToStaticMarkup } = await import("react-dom/server");
    hooks.state = [];
    hooks.cursor = 0;
    const markup = renderToStaticMarkup(BackupCard() as never);
    expect(markup).not.toBeNull();
    runEffect();
    await vi.advanceTimersByTimeAsync(1);
    expect(service.readBackupStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(service.readBackupStatus).toHaveBeenCalledTimes(2);
  });
});

function renderToStaticMarkupSafe(node: unknown): string | null {
  if (node === null) return null;
  throw new Error(`expected null, got ${String(node)}`);
}
