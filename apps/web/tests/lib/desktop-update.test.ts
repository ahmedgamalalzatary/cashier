import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import {
  installUpdate,
  onUpdateAvailable,
  pendingUpdate,
} from "../../src/lib/desktop-update";

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
  listen.mockReset();
});
const desktop = () => vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

describe("desktop update bridge", () => {
  it("does nothing in an ordinary browser", async () => {
    vi.stubGlobal("window", {});
    expect(await pendingUpdate()).toBeNull();
    const stop = onUpdateAvailable(() => {});
    stop();
    expect(invoke).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it("asks the desktop shell for an update it already found", async () => {
    desktop();
    invoke.mockResolvedValue("0.2.3");
    expect(await pendingUpdate()).toBe("0.2.3");
    expect(invoke).toHaveBeenCalledWith("pending_update");
  });

  it("hears about an update found while Cashier is open", async () => {
    desktop();
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const found = vi.fn();
    const stop = onUpdateAvailable(found);
    const handler = listen.mock.calls[0][1] as (event: {
      payload: string;
    }) => void;
    expect(listen.mock.calls[0][0]).toBe("update-available");
    handler({ payload: "0.2.4" });
    expect(found).toHaveBeenCalledWith("0.2.4");
    stop();
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it("asks the shell to close Cashier and install the update", async () => {
    desktop();
    invoke.mockResolvedValue(undefined);
    await installUpdate();
    expect(invoke).toHaveBeenCalledWith("install_update");
  });
});
