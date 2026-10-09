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
    value: {
      branch: Branch | null;
      branches: Branch[];
      error: string | null;
      refresh(): Promise<void>;
      selectBranch(id: string): void;
    };
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
    expect(value.branch?.id).toBe(second);
    const oldKey = tree.props.children.key;
    value.selectBranch(first);
    const changed = render();
    expect(changed.props.value.branch?.id).toBe(first);
    expect(changed.props.children.key).not.toBe(oldKey);
    expect(storage.get(`cashier.branch.${admin.id}`)).toBe(first);
    expect(hooks.replace).toHaveBeenCalledWith("/");
  });

  it("reports no branch and invents none when none is available", async () => {
    vi.mocked(listBranches).mockResolvedValue([]);
    const value = (await load()).props.value;
    expect(value.branch).toBeNull();
    expect(value.branches).toEqual([]);
    expect(storage.size).toBe(0);
  });

  it("uses the cashier's assigned UUID even when a different workspace is saved", async () => {
    hooks.user = { ...admin, role: "cashier", branchId: second };
    storage.set(`cashier.branch.${admin.id}`, first);
    const tree = await load();
    expect(tree.props.value.branch?.id).toBe(second);
    tree.props.value.selectBranch(first);
    expect(render().props.value.branch?.id).toBe(second);
    expect(hooks.replace).not.toHaveBeenCalled();
  });
});

describe("a signed-in admin whose branch list is empty", () => {
  const superAdmin = () => {
    hooks.user = { ...admin, isSuperAdmin: true };
  };

  it("still renders its children, so the shell and its way out stay reachable", async () => {
    superAdmin();
    vi.mocked(listBranches).mockResolvedValue([]);

    const html = renderToStaticMarkup(await load());

    expect(html).toContain("Branch content");
  });

  it("reports no selected branch and invents none", async () => {
    superAdmin();
    vi.mocked(listBranches).mockResolvedValue([]);

    const value = (await load()).props.value;

    expect(value.branch).toBeNull();
    expect(value.branches).toEqual([]);
    expect(value.error).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("picks up the first branch once one is created and refreshed", async () => {
    superAdmin();
    vi.mocked(listBranches).mockResolvedValue([]);
    const empty = (await load()).props.value;
    const created: Branch = { ...rows[0], name: "First branch" };
    vi.mocked(listBranches).mockResolvedValue([created]);

    await empty.refresh();

    const value = render().props.value;
    expect(value.branch?.id).toBe(created.id);
    expect(value.branches).toHaveLength(1);
    expect(renderToStaticMarkup(render())).toContain("Branch content");
  });
});

describe("a branch list that could not be loaded", () => {
  it("keeps the children and the way out, and says what went wrong", async () => {
    vi.mocked(listBranches).mockRejectedValue(new Error("تعذر تحميل الفروع"));

    const tree = await load();
    const html = renderToStaticMarkup(tree);

    expect(html).toContain("Branch content");
    expect(tree.props.value.error).toBe("تعذر تحميل الفروع");
    expect(tree.props.value.branch).toBeNull();
  });

  it("can be retried from the page that shows the failure", async () => {
    vi.mocked(listBranches).mockRejectedValueOnce(new Error("تعذر تحميل الفروع"));
    const failed = (await load()).props.value;
    vi.mocked(listBranches).mockResolvedValue(rows);

    await failed.refresh();

    expect(render().props.value.branch?.id).toBe(first);
    expect(render().props.value.error).toBeNull();
  });
});
