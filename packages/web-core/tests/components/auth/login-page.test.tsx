import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../../src/features/login-page";

const login = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("../../../src/components/auth/auth-provider", () => ({
  useAuth: () => ({ login }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  login.mockClear();
});

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}

describe("login account choice", () => {
  it("offers both roles and selects cashier initially", () => {
    const html = renderToStaticMarkup(LoginPage());
    expect(html).toContain('name="role"');
    expect(html).toContain('<option value="cashier" selected="">');
    expect(html).toContain('<option value="admin">');
  });
  it.each(["admin", "cashier"])(
    "submits the chosen %s role with the credentials",
    async (role) => {
      const data = { username: "ali", password: "secret123", role };
      vi.stubGlobal(
        "FormData",
        class {
          get(key: keyof typeof data) {
            return data[key];
          }
        },
      );
      const form = nodes(LoginPage()).find((node) => node.type === "form")!;
      const submit = form.props.onSubmit as (event: {
        preventDefault(): void;
        currentTarget: object;
      }) => Promise<void>;
      await submit({ preventDefault() {}, currentTarget: {} });
      expect(login).toHaveBeenCalledExactlyOnceWith("ali", "secret123", role);
    },
  );
});
