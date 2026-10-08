import { testId } from "@cashier/shared/test-support";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  logoutRequestMock,
  writeSessionMock,
  currentUserMock,
  updateSessionUserMock,
  readSessionMock,
  useEffectMock,
  useStateMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  logoutRequestMock: vi.fn(),
  writeSessionMock: vi.fn(),
  currentUserMock: vi.fn(),
  updateSessionUserMock: vi.fn(),
  readSessionMock: vi.fn(),
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

vi.mock("../../../src/services/auth-service", () => ({
  login: vi.fn(),
  logout: logoutRequestMock,
  currentUser: currentUserMock,
}));

vi.mock("../../../src/lib/auth", () => ({
  normalizePath: (path: string) => path,
  canOpenPath: () => true,
  loginPathFor: () => "/login",
  postLoginPath: () => "/",
  readSession: () => readSessionMock(),
  subscribeToSessionChanges: () => () => undefined,
  writeSession: writeSessionMock,
  updateSessionUser: updateSessionUserMock,
}));

import { AuthProvider } from '../../../src/components/auth/auth-provider';

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
    id: testId(1),
    name: "Super",
    role: "admin",
    branchId: null,
    isSuperAdmin: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    readSessionMock.mockReturnValue({
      user: { id: testId(1), name: "Super", role: "admin" },
    });
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

  it("discards a late response that belongs to a replaced session", async () => {
    // the mount-time request is in flight when the user logs out and someone
    // else logs in, so the stored session no longer holds this user
    readSessionMock.mockReturnValueOnce({
      user: { id: testId(1), name: "Super", role: "admin" },
    });
    currentUserMock.mockImplementation(async () => {
      readSessionMock.mockReturnValue({
        user: { id: testId(2), name: "Other", role: "admin" },
      });
      return freshUser;
    });

    renderProvider();
    runEffects();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSessionUserMock).not.toHaveBeenCalled();
  });

  it("discards the response when the session was cleared while in flight", async () => {
    readSessionMock.mockReturnValueOnce({
      user: { id: testId(1), name: "Super", role: "admin" },
    });
    currentUserMock.mockImplementation(async () => {
      readSessionMock.mockReturnValue(null);
      return freshUser;
    });

    renderProvider();
    runEffects();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSessionUserMock).not.toHaveBeenCalled();
  });
});
