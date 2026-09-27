import { readSession, writeSession } from "./auth";
import { selectedBranchId } from "./branch-session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    res = await fetch(`${BASE}${path}`, {
      ...init,
      // the HttpOnly auth cookie travels with every call; the Authorization
      // header is only attached by non-browser shells holding a fallback token
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && path !== "/api/auth/login") writeSession(null);
    throw new Error(body?.error ?? "حدث خطأ غير متوقع");
  }
  const body = await res.json();
  if (!globalRequest) {
    const current = readSession();
    if (
      current?.user.id !== session?.user.id ||
      selectedBranchId(current?.user) !== branchId
    ) {
      throw new Error("تم تغيير الحساب أو الفرع؛ أعد المحاولة من الفرع الحالي");
    }
  }
  return body as T;
}
