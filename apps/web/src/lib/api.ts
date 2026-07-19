import { readSession, writeSession } from "./auth";

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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: buildHeaders(init?.headers, session?.token, init?.body != null),
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && path !== "/api/auth/login") writeSession(null);
    throw new Error(body?.error ?? "حدث خطأ غير متوقع");
  }
  return res.json();
}
