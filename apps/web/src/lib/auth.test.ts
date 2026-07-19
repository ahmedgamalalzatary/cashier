import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANGED_EVENT, SESSION_KEY, subscribeToSessionChanges } from "./auth";

afterEach(() => vi.unstubAllGlobals());

describe("subscribeToSessionChanges", () => {
  it("notifies for same-document auth changes and cross-tab session storage changes", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionChanges(listener);

    browser.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    browser.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated" }));
    browser.dispatchEvent(Object.assign(new Event("storage"), { key: SESSION_KEY }));

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    browser.dispatchEvent(Object.assign(new Event("storage"), { key: SESSION_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
