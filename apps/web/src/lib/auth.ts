import type { AuthUser, Role, Session } from "@cashier/shared";
import { ADMIN_PATHS } from "./navigation";
export type { AuthUser, Role, Session } from "@cashier/shared";

export const SESSION_KEY = "cashier.session";
export const AUTH_CHANGED_EVENT = "cashier:auth-changed";

// What the browser persists. The JWT itself is never stored here: browsers
// authenticate with the HttpOnly `cashier.token` cookie set by the API, so a
// stored token would only give XSS a second copy to steal. Only the profile
// (for route guards) and the expiry (to avoid rendering on a dead session)
// are kept. The `token` field exists solely for non-http(s) shells
// (Tauri file-protocol builds) where cookies are not sent.
export type PersistedSession = {
  user: AuthUser;
  exp: number;
  token?: string;
};

export function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

// Cookies are not sent from non-http(s) pages (Tauri file protocol), so
// those shells fall back to a Bearer token like before.
function usesTokenFallback() {
  if (typeof window === "undefined") return false;
  const protocol = window.location?.protocol;
  return !!protocol && protocol !== "http:" && protocol !== "https:";
}

export function readSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SESSION_KEY) ?? "null",
    ) as PersistedSession | null;
    if (
      !value?.user?.id ||
      !["admin", "cashier"].includes(value.user.role) ||
      typeof value.exp !== "number" ||
      !Number.isFinite(value.exp) ||
      value.exp * 1000 <= Date.now()
    ) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return value;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function sessionExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof decoded.exp === "number" && Number.isFinite(decoded.exp)
      ? decoded.exp
      : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) {
    const exp = sessionExpiry(session.token);
    if (exp === null || exp * 1000 <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
    } else {
      const persisted: PersistedSession = {
        user: session.user,
        exp,
      };
      if (usesTokenFallback()) persisted.token = session.token;
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(persisted));
    }
  } else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function subscribeToSessionChanges(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === null) listener();
  };
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function canOpenPath(role: Role, pathname: string) {
  return (
    role === "admin" ||
    !ADMIN_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

export function loginPathFor(pathname: string) {
  const normalizedPath = normalizePath(pathname);
  return normalizedPath === "/login"
    ? "/login"
    : `/login?next=${encodeURIComponent(normalizedPath)}`;
}

export function postLoginPath(search: string, role: Role) {
  const destination = new URLSearchParams(search).get("next");
  if (
    !destination ||
    !destination.startsWith("/") ||
    destination.startsWith("//") ||
    destination.includes("\\") ||
    !canOpenPath(role, destination)
  ) {
    return "/";
  }
  return destination;
}
