import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, logoutRequestMock, writeSessionMock, useStateMock } =
  vi.hoisted(() => ({
    replaceMock: vi.fn(),
    logoutRequestMock: vi.fn(),
    writeSessionMock: vi.fn(),
    useStateMock: vi.fn(),
  }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: useStateMock,
    useEffect: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/services/auth-service", () => ({
  login: vi.fn(),
  logout: logoutRequestMock,
}));

vi.mock("@/lib/auth", () => ({
  normalizePath: (path: string) => path,
  canOpenPath: () => true,
  loginPathFor: () => "/login",
  postLoginPath: () => "/",
  readSession: () => ({ user: { role: "admin" } }),
  subscribeToSessionChanges: () => () => undefined,
  writeSession: writeSessionMock,
}));

import { AuthProvider } from "../../../src/components/auth/auth-provider";

type LogoutFn = () => Promise<void>;

function logoutFn(): LogoutFn {
  const session = { user: { role: "admin" } };
  useStateMock.mockImplementation(() => [session, vi.fn()]);
  const element = AuthProvider({ children: null }) as ReactElement<{
    value: { logout: LogoutFn };
  }>;
  return element.props.value.logout;
}

describe("auth provider logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a promise so callers can wait for logout to finish", () => {
    logoutRequestMock.mockResolvedValue({ ok: true });
    const result = logoutFn()();

    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it("waits for the server logout before clearing the session or navigating", async () => {
    let release!: (value: { ok: boolean }) => void;
    logoutRequestMock.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        release = resolve;
      }),
    );

    const pending = logoutFn()();
    // While the server request is still in flight, nothing local may change.
    expect(writeSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();

    release({ ok: true });
    await pending;

    expect(logoutRequestMock).toHaveBeenCalledOnce();
    expect(writeSessionMock).toHaveBeenCalledWith(null);
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });
});
