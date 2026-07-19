import type { Role, Session } from "@cashier/shared";
import { ADMIN_PATHS } from "./navigation";
export type { AuthUser, Role, Session } from "@cashier/shared";

export const SESSION_KEY = "cashier.session";
export const AUTH_CHANGED_EVENT = "cashier:auth-changed";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SESSION_KEY) ?? "null",
    ) as Session | null;
    if (
      !value?.token ||
      !value.user?.id ||
      !["admin", "cashier"].includes(value.user.role) ||
      !hasUnexpiredToken(value.token)
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

function hasUnexpiredToken(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return (
      typeof decoded.exp === "number" &&
      Number.isFinite(decoded.exp) &&
      decoded.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}

export function writeSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session)
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
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
  return pathname === "/login"
    ? "/login"
    : `/login?next=${encodeURIComponent(pathname)}`;
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
