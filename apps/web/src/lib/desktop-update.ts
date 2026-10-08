import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// The desktop shell looks for newer releases while Cashier is open (plan 6.3).
// In an ordinary browser every function here does nothing.
const inDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** A newer version the shell already found, if any. */
export async function pendingUpdate(): Promise<string | null> {
  if (!inDesktop()) return null;
  return (await invoke<string | null>("pending_update")) ?? null;
}

/** Calls `found` with the version when the shell finds a newer release. */
export function onUpdateAvailable(found: (version: string) => void) {
  if (!inDesktop()) return () => {};
  const stopping = listen<string>("update-available", (event) =>
    found(event.payload),
  );
  return () => {
    void stopping.then((stop) => stop());
  };
}

/** Closes Cashier cleanly; it reopens, installs the update and reopens again. */
export function installUpdate() {
  return invoke<void>("install_update");
}
