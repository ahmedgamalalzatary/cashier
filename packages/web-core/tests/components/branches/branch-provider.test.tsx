import type { AuthUser, Branch } from "@cashier/shared";
import type { ReactElement } from "react";
import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchProvider } from "../../../src/components/branches/branch-provider";
import { listBranches } from "../../../src/services/branches-service";

const hooks = vi.hoisted(() => ({
  user: null as AuthUser | null,
  state: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  version: { current: 0 },
  replace: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] =
          typeof value === "function" ? value(hooks.state[index]) : value;
      },
    ];
  },
  useRef: () => hooks.version,
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    hooks.effects.push(callback);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: hooks.replace }),
}));
vi.mock("../../../src/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: hooks.user }),
}));
vi.mock("../../../src/services/branches-service", () => ({
  listBranches: vi.fn(),
}));

const first = "019a1234-5678-7000-8000-000000000401";
const second = "019a1234-5678-7000-8000-000000000402";
const admin: AuthUser = {
  id: "019a1234-5678-7000-8000-000000000403",
  name: "Admin",
  role: "admin",
  isSuperAdmin: false,
};
const rows: Branch[] = [first, second].map((id) => ({
  id,
  name: id === first ? "First" : "Second",
  isActive: true,
  createdAt: "2026-10-08T00:00:00Z",
}));
let storage: Map<string, string>;
let cleanups: Array<() => void>;
let accountCounter = 500;

function render() {
  hooks.cursor = 0;
  hooks.effects = [];
  return BranchProvider({ children: <p>Branch content</p> }) as ReactElement<{
    value: { branch: Branch; selectBranch(id: string): void };
    children: ReactElement;
  }>;
}
async function load() {
  render();
  cleanups = hooks.effects
    .map((effect) => effect())
    .filter((fn): fn is () => void => typeof fn === "function");
  await Promise.resolve();
  await Promise.resolve();
  return render();
}
beforeEach(() => {
  hooks.state = [];
  admin.id = testId(++accountCounter);
  hooks.user = admin;
  hooks.version.current = 0;
  hooks.replace.mockClear();
  vi.mocked(listBranches).mockReset().mockResolvedValue(rows);
  storage = new Map();
  cleanups = [];
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: () => {},
    }),
  );
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("UUID branch workspaces", () => {
  it("selects an available UUID when no branch has been saved", async () => {
    const tree = await load();
    expect(renderToStaticMarkup(tree)).toContain("Branch content");
    expect(storage.get(`cashier.branch.${admin.id}`)).toBe(first);
  });

  it("restores a saved UUID and resets the page when another workspace is selected", async () => {
    storage.set(`cashier.branch.${admin.id}`, second);
    const tree = await load();
    const value = tree.props.value as {
      branch: Branch;
      selectBranch(id: string): void;
    };
    expect(value.branch.id).toBe(second);
    const oldKey = tree.props.children.key;
    value.selectBranch(first);
    const changed = render();
    expect(changed.props.value.branch.id).toBe(first);
    expect(changed.props.children.key).not.toBe(oldKey);
    expect(storage.get(`cashier.branch.${admin.id}`)).toBe(first);
    expect(hooks.replace).toHaveBeenCalledWith("/");
  });

  it("shows unavailable branches without exposing business content or inventing a branch", async () => {
    vi.mocked(listBranches).mockResolvedValue([]);
    const html = renderToStaticMarkup(await load());
    expect(html).toContain('role="alert"');
    expect(html).toContain("لا يوجد فرع متاح لهذا الحساب");
    expect(html).not.toContain("Branch content");
    expect(storage.size).toBe(0);
  });

  it("uses the cashier's assigned UUID even when a different workspace is saved", async () => {
    hooks.user = { ...admin, role: "cashier", branchId: second };
    storage.set(`cashier.branch.${admin.id}`, first);
    const tree = await load();
    expect(tree.props.value.branch.id).toBe(second);
    tree.props.value.selectBranch(first);
    expect(render().props.value.branch.id).toBe(second);
    expect(hooks.replace).not.toHaveBeenCalled();
  });
});
