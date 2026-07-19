export type Role = "admin" | "cashier";

export type AuthUser = {
  id: number;
  name: string;
  role: Role;
};

export type Session = {
  token: string;
  user: AuthUser;
};

export const SESSION_KEY = "cashier.session";
export const AUTH_CHANGED_EVENT = "cashier:auth-changed";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    if (!value?.token || !value.user?.id || !["admin", "cashier"].includes(value.user.role)) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function subscribeToSessionChanges(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) listener();
  };
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function canOpenPath(role: Role, pathname: string) {
  const adminPaths = ["/categories", "/warehouse", "/suppliers", "/employees", "/salaries", "/reports"];
  return role === "admin" || !adminPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
