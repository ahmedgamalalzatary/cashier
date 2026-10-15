import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WasteEntryForm } from "../../../src/components/waste/waste-entry-form";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => unknown>,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] = value;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => unknown) => {
    hooks.effects.push(callback);
  },
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

// useState order inside WasteEntryForm:
// catalog, targetKey, warehouse, quantity, reason, note, clientRequestId,
// error, cafeForcedNotice, saving
function seededCatalogState() {
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.state = [
    {
      items: [{ id: "i1", name: "قهوة", stockUnit: "غرام" }],
      recipes: [],
      products: [],
    },
    "",
    "cafe",
    "",
    "damaged",
    "",
    "0000",
    "",
    false,
    false,
  ];
}

function propsOf(node: unknown): Record<string, unknown> {
  return (node as { props?: Record<string, unknown> }).props ?? {};
}

function elements(node: ReactNode): ReactElement[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement;
  const walk: unknown[] = Object.values(propsOf(element)).filter(
    (value) => typeof value === "object" || typeof value === "string",
  );
  return [element, ...walk.flatMap((value) => elements(value as ReactNode))];
}

function render(props: Parameters<typeof WasteEntryForm>[0]) {
  return renderToStaticMarkup(<WasteEntryForm {...props} />);
}

describe("waste entry form presets", () => {
  it("renders normally without presets", () => {
    seededCatalogState();
    const markup = render({ onSaved: vi.fn() });
    expect(markup).toContain("الصنف أو المنتج");
  });

  it("limits the target list to the allowed keys when presets are given", () => {
    hooks.cursor = 0;
    hooks.effects = [];
    hooks.state = [
      {
        items: [
          { id: "i1", name: "قهوة", stockUnit: "غرام" },
          { id: "i2", name: "حليب", stockUnit: "لتر" },
        ],
        recipes: [],
        products: [],
      },
      "",
      "cafe",
      "",
      "damaged",
      "",
      "0000",
      "",
      false,
      false,
    ];
    const targetSelect = elements(
      WasteEntryForm({
        onSaved: vi.fn(),
        allowedTargetKeys: ["item:i1"],
      }),
    ).find((el) => "options" in propsOf(el));
    const options = (
      propsOf(targetSelect).options as Array<{
        value: string;
        label: string;
      }>
    ).map((option) => option.value);
    expect(options).toEqual(["item:i1"]);
  });

  it("locks the warehouse when a preset warehouse is given", () => {
    seededCatalogState();
    const markup = render({
      onSaved: vi.fn(),
      presetWarehouse: "cafe",
    });
    expect(markup).not.toContain("المخزن");
  });
});
