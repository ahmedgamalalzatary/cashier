import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  logoutRequestMock,
  writeSessionMock,
  currentUserMock,
  updateSessionUserMock,
  useEffectMock,
  useStateMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  logoutRequestMock: vi.fn(),
  writeSessionMock: vi.fn(),
  currentUserMock: vi.fn(),
  updateSessionUserMock: vi.fn(),
  useEffectMock: vi.fn(),
  useStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: useStateMock,
    useEffect: useEffectMock,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/services/auth-service", () => ({
  login: vi.fn(),
  logout: logoutRequestMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/auth", () => ({
  normalizePath: (path: string) => path,
  canOpenPath: () => true,
  loginPathFor: () => "/login",
  postLoginPath: () => "/",
  readSession: () => ({ user: { role: "admin" } }),
  subscribeToSessionChanges: () => () => undefined,
  writeSession: writeSessionMock,
  updateSessionUser: updateSessionUserMock,
}));

import { AuthProvider } from "../../../src/components/auth/auth-provider";

type LogoutFn = () => Promise<void>;

function renderProvider() {
  const session = { user: { role: "admin" } };
  useStateMock.mockImplementation(() => [session, vi.fn()]);
  AuthProvider({ children: null }) as ReactElement;
}

function runEffects() {
  for (const [effect] of useEffectMock.mock.calls) {
    (effect as () => void)();
  }
}

describe("auth provider logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a promise so callers can wait for logout to finish", () => {
    logoutRequestMock.mockResolvedValue({ ok: true });
    const session = { user: { role: "admin" } };
    useStateMock.mockImplementation(() => [session, vi.fn()]);
    const element = AuthProvider({ children: null }) as ReactElement<{
      value: { logout: LogoutFn };
    }>;

    const result = element.props.value.logout();

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
    const session = { user: { role: "admin" } };
    useStateMock.mockImplementation(() => [session, vi.fn()]);
    const element = AuthProvider({ children: null }) as ReactElement<{
      value: { logout: LogoutFn };
    }>;

    const pending = element.props.value.logout();
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

describe("auth provider session refresh", () => {
  const freshUser = {
    id: 1,
    name: "Super",
    role: "admin",
    branchId: null,
    isSuperAdmin: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue(freshUser);
  });

  it("replaces the stored user with the server's current user on load", async () => {
    renderProvider();
    runEffects();
    await vi.waitFor(() =>
      expect(updateSessionUserMock).toHaveBeenCalledWith(freshUser),
    );
  });

  it("does not rewrite the stored user when the session is no longer valid", async () => {
    currentUserMock.mockRejectedValue(new Error("انتهت الجلسة"));
    renderProvider();
    runEffects();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSessionUserMock).not.toHaveBeenCalled();
  });
});
