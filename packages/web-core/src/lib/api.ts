import { readSession, writeSession } from "./auth";
import { selectedBranchId } from "./branch-session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Fired on `window` after any successful write, so status displays refresh at once. */
export const DATA_CHANGED_EVENT = "cashier:data-changed";

export function buildHeaders(
  input: HeadersInit | undefined,
  token?: string,
  hasBody = false,
) {
  const headers = new Headers(input);
  if (hasBody && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readSession();
  const headers = buildHeaders(
    init?.headers,
    session?.token,
    init?.body != null,
  );
  const globalRequest = /^\/api\/(auth|branches)(\/|$)/.test(path);
  const branchId = globalRequest ? undefined : selectedBranchId(session?.user);
  if (branchId !== undefined) headers.set("X-Branch-Id", String(branchId));
  else headers.delete("X-Branch-Id");
  let res: Response;
  try {
    const desktopBase =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
        ? (window as Window & { __CASHIER_DESKTOP_API_URL__?: string })
            .__CASHIER_DESKTOP_API_URL__
        : undefined;
    res = await fetch(`${desktopBase ?? BASE}${path}`, {
      ...init,
      // Browsers use the HttpOnly cookie; desktop shells attach their fallback
      // token through the Authorization header.
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (
      (res.status === 401 && path !== "/api/auth/login") ||
      (res.status === 403 && path === "/api/auth/me")
    )
      writeSession(null);
    throw new Error(body?.error ?? "حدث خطأ غير متوقع");
  }
  // 204 carries no body; reading it as JSON would fail a successful request.
  const body = res.status === 204 ? undefined : await res.json();
  if (!globalRequest) {
    const current = readSession();
    if (
      current?.user.id !== session?.user.id ||
      selectedBranchId(current?.user) !== branchId
    ) {
      throw new Error("تم تغيير الحساب أو الفرع؛ أعد المحاولة من الفرع الحالي");
    }
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && typeof window !== "undefined")
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  return body as T;
}
