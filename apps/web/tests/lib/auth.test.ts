import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CHANGED_EVENT,
  SESSION_KEY,
  loginPathFor,
  postLoginPath,
  readSession,
  subscribeToSessionChanges,
} from "../../src/lib/auth";
import { ADMIN_PATHS } from "../../src/lib/navigation";

afterEach(() => vi.unstubAllGlobals());

describe("subscribeToSessionChanges", () => {
  it("notifies for same-document auth changes and cross-tab session storage changes", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionChanges(listener);

    browser.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key: "unrelated" }),
    );
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key: SESSION_KEY }),
    );

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key: SESSION_KEY }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifies when another document clears local storage", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionChanges(listener);

    browser.dispatchEvent(Object.assign(new Event("storage"), { key: null }));

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

function tokenWithExpiration(exp: number) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp })}.signature`;
}

function browserWithSession(token: string) {
  const browser = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: vi.fn(() =>
        JSON.stringify({
          token,
          user: { id: 1, name: "Admin", role: "admin" },
        }),
      ),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    },
  });
  vi.stubGlobal("window", browser);
  return browser;
}

describe("session validity", () => {
  it("rejects and removes an expired JWT before rendering protected UI", () => {
    const browser = browserWithSession(tokenWithExpiration(1));

    expect(readSession()).toBeNull();
    expect(browser.localStorage.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });

  it("accepts a structurally valid unexpired session", () => {
    browserWithSession(tokenWithExpiration(Math.floor(Date.now() / 1000) + 60));

    expect(readSession()?.user.role).toBe("admin");
  });

  it("removes malformed JSON from local storage", () => {
    const browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: vi.fn(() => "{broken"),
        removeItem: vi.fn(),
      },
    });
    vi.stubGlobal("window", browser);

    expect(readSession()).toBeNull();
    expect(browser.localStorage.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });
});

describe("login redirects", () => {
  it("preserves an allowed protected deep link through login", () => {
    expect(loginPathFor("/warehouse")).toBe("/login?next=%2Fwarehouse");
    expect(postLoginPath("?next=%2Fwarehouse", "admin")).toBe("/warehouse");
  });

  it("rejects external and role-forbidden return locations", () => {
    expect(postLoginPath("?next=https%3A%2F%2Fevil.example", "admin")).toBe(
      "/",
    );
    expect(postLoginPath("?next=%2Fwarehouse", "cashier")).toBe("/");
  });

  it("derives every protected route from the shared navigation config", () => {
    expect(ADMIN_PATHS).toContain("/warehouse");
    expect(ADMIN_PATHS).toContain("/categories");
    expect(ADMIN_PATHS).toContain("/users");
    expect(ADMIN_PATHS).toContain("/recipes");
    expect(ADMIN_PATHS).toContain("/purchases");
  });
});
