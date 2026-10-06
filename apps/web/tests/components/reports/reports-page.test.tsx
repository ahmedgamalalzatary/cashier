import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "../../../src/app/reports/page";
import { Button } from "../../../src/components/ui/button";
import { PageHeader } from "../../../src/components/ui/page-header";
import { Tabs } from "../../../src/components/ui/tabs";
import { getReports } from "../../../src/services/reports-service";
import { reportsFixture } from "../../fixtures/reports";
import { cairoCalendarDate } from "../../../src/lib/cairo-date";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  effect: null as null | (() => void | (() => void)),
  branch: { id: 1, name: "Main Branch" },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length)
      hooks.state[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] =
          typeof value === "function" ? value(hooks.state[index]) : value;
      },
    ];
  },
  useEffect: (callback: () => void | (() => void)) => {
    hooks.effect = callback;
  },
  useMemo: (callback: () => unknown) => callback(),
}));
vi.mock("@/components/branches/branch-provider", () => ({
  useBranch: () => ({ branch: hooks.branch }),
}));
vi.mock(
  "@/services/reports-service",
  async () => import("../../../src/services/reports-service"),
);
vi.mock("../../../src/services/reports-service", () => ({
  getReports: vi.fn(),
}));
vi.mock(
  "@/components/reports/report-table",
  async () => import("../../../src/components/reports/report-table"),
);
vi.mock(
  "@/components/ui/button",
  async () => import("../../../src/components/ui/button"),
);
vi.mock(
  "@/components/ui/page-header",
  async () => import("../../../src/components/ui/page-header"),
);
vi.mock("@/lib/cairo-date", async () => import("../../../src/lib/cairo-date"));
vi.mock("../../../src/lib/cairo-date", () => ({
  cairoCalendarDate: vi.fn(() => "2026-09-27"),
}));
vi.mock("@/lib/format", async () => import("../../../src/lib/format"));
vi.mock(
  "@/models/reports-model",
  async () => import("../../../src/models/reports-model"),
);

function render() {
  hooks.cursor = 0;
  return ReportsPage();
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function action(tree: ReturnType<typeof render>, print: boolean) {
  const header = nodes(tree).find((node) => node.type === PageHeader)!;
  return nodes(header.props.actions as ReactNode).filter(
    (node) => node.type === Button,
  )[print ? 1 : 0];
}
function openTab(tree: ReturnType<typeof render>, id: string) {
  const tabs = nodes(tree).find((node) => node.type === Tabs)!;
  (tabs.props.onChange as (tab: string) => void)(id);
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
async function loaded() {
  vi.mocked(getReports).mockResolvedValueOnce(reportsFixture());
  render();
  hooks.effect!();
  await settle();
  return render();
}
function changeStart(tree: ReturnType<typeof render>, value: string) {
  const input = nodes(tree).find(
    (node) => node.type === "input" && node.props["aria-label"] === "من",
  )!;
  (input.props.onChange as (e: { target: { value: string } }) => void)({
    target: { value },
  });
}

describe("report loading and printing", () => {
  beforeEach(() => {
    hooks.state.length = 0;
    hooks.effect = null;
    hooks.branch = { id: 1, name: "Main Branch" };
    vi.mocked(getReports).mockReset();
    vi.mocked(cairoCalendarDate).mockReturnValue("2026-09-27");
  });
  it("hides the previous branch's figures while a new branch report is loading", async () => {
    await loaded();
    hooks.branch = { id: 2, name: "Other Branch" };
    const html = renderToStaticMarkup(render());
    expect(html).not.toContain("2026-09-01 — 2026-09-10");
    expect(html).not.toContain("حسب اليوم");
    expect(action(render(), true).props.disabled).toBe(true);
  });
  it("uses the current Cairo month when the page is opened after midnight", () => {
    vi.mocked(cairoCalendarDate).mockReturnValue("2026-10-01");
    const inputs = nodes(render()).filter((node) => node.type === "input");
    expect(inputs[0].props.value).toBe("2026-10-01");
    expect(inputs[1].props.value).toBe("2026-10-01");
    expect(inputs[1].props.max).toBe("2026-10-01");
  });
  it("prints the loaded range after the editable dates change", async () => {
    const tree = await loaded();
    changeStart(tree, "2026-09-02");
    const html = renderToStaticMarkup(render());
    expect(html).toContain("2026-09-01 — 2026-09-10");
    expect(html).not.toContain("الفترة: 2026-09-02");
    expect(html).toContain("مجمل الربح");
    expect(html).toContain("لم تطبق");
  });
  it("blocks printing during refresh and after a failed refresh", async () => {
    const tree = await loaded();
    changeStart(tree, "2026-09-02");
    vi.mocked(getReports).mockRejectedValueOnce(new Error("Offline"));
    (action(render(), false).props.onClick as () => void)();
    expect(action(render(), true).props.disabled).toBe(true);
    hooks.effect!();
    await settle();
    const failed = render();
    expect(action(failed, true).props.disabled).toBe(true);
    expect(renderToStaticMarkup(failed)).toContain("Offline");
  });
  it("prints a successfully refreshed period and enables printing again", async () => {
    const tree = await loaded();
    changeStart(tree, "2026-09-02");
    const next = reportsFixture();
    next.range.from = "2026-09-02";
    vi.mocked(getReports).mockResolvedValueOnce(next);
    (action(render(), false).props.onClick as () => void)();
    render();
    hooks.effect!();
    await settle();
    expect(renderToStaticMarkup(render())).toContain("2026-09-02 — 2026-09-10");
    expect(action(render(), true).props.disabled).toBe(false);
  });
  it("renders operational quantities, staff and costs", async () => {
    const data = reportsFixture();
    data.operations.transfers = [
      { id: 4, createdByName: "Transfer Staff", totalCost: "14.00" },
    ];
    data.operations.preparations = [
      {
        id: 7,
        recipeName: "Dough",
        preparedByName: "Prep Staff",
        totalCost: "8.00",
      },
    ];
    vi.mocked(getReports).mockResolvedValueOnce(data);
    render();
    hooks.effect!();
    await settle();
    openTab(render(), "operations");
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Transfer Staff");
    expect(html).toContain("Prep Staff");
    expect(html).toContain("Dough");
  });
  it("discards a late response from an obsolete request", async () => {
    let resolve!: (value: ReturnType<typeof reportsFixture>) => void;
    vi.mocked(getReports).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render();
    const cleanup = hooks.effect!();
    if (typeof cleanup === "function") cleanup();
    resolve(reportsFixture());
    await settle();
    expect(renderToStaticMarkup(render())).not.toContain("حسب اليوم");
  });
  it("explains current stock and supplier balance snapshots", async () => {
    await loaded();
    openTab(render(), "stock");
    expect(renderToStaticMarkup(render())).toContain(
      "لا تمثل رصيد نهاية الفترة",
    );
    openTab(render(), "suppliers");
    expect(renderToStaticMarkup(render())).toContain(
      "جميع المشتريات والمدفوعات",
    );
  });
});
