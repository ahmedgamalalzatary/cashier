import { testId } from "@cashier/shared/test-support";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReportsPage,
  type ReportExport,
} from "../../../src/features/reports-page";
import { Button } from "../../../src/components/ui/button";
import { PageHeader } from "../../../src/components/ui/page-header";
import { Tabs } from "../../../src/components/ui/tabs";
import { getReports } from "../../../src/services/reports-service";
import { reportsFixture } from "../../fixtures/reports";
import {
  cairoCalendarDate,
  cairoCalendarLabel,
} from "../../../src/lib/cairo-date";
import { figureChange } from "../../../src/features/reports/report-overview";
import { periodFixture } from "../../fixtures/reports";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  effect: null as null | (() => void | (() => void)),
  branch: {
    id: "00000000-0000-7000-8000-000000000001",
    name: "Main Branch",
  } as { id: string; name: string } | null,
  branchError: null as string | null,
  refreshBranches: vi.fn(async () => undefined),
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
vi.mock("../../../src/components/branches/branch-provider", () => ({
  useBranch: () => ({
    branch: hooks.branch,
    branches: [],
    error: hooks.branchError,
    selectBranch: () => undefined,
    refresh: hooks.refreshBranches,
  }),
}));
vi.mock(
  "../../../src/services/reports-service",
  async () => import("../../../src/services/reports-service"),
);
vi.mock("../../../src/services/reports-service", () => ({
  getReports: vi.fn(),
}));
vi.mock(
  "../../../src/components/reports/report-table",
  async () => import("../../../src/components/reports/report-table"),
);
vi.mock(
  "../../../src/components/ui/button",
  async () => import("../../../src/components/ui/button"),
);
vi.mock(
  "../../../src/components/ui/page-header",
  async () => import("../../../src/components/ui/page-header"),
);
vi.mock(
  "../../../src/lib/cairo-date",
  async () => import("../../../src/lib/cairo-date"),
);
vi.mock("../../../src/lib/cairo-date", async (original) => ({
  ...(await original<typeof import("../../../src/lib/cairo-date")>()),
  cairoCalendarDate: vi.fn(() => "2026-09-27"),
}));
vi.mock(
  "../../../src/lib/format",
  async () => import("../../../src/lib/format"),
);
vi.mock(
  "../../../src/models/reports-model",
  async () => import("../../../src/models/reports-model"),
);

function render(props: Parameters<typeof ReportsPage>[0] = {}) {
  hooks.cursor = 0;
  return ReportsPage(props);
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function headerButtons(tree: ReturnType<typeof render>) {
  const header = nodes(tree).find((node) => node.type === PageHeader)!;
  return nodes(header.props.actions as ReactNode).filter(
    (node) => node.type === Button,
  );
}
const printButton = (tree: ReturnType<typeof render>) =>
  headerButtons(tree)[0]!;
const excelButton = (tree: ReturnType<typeof render>) =>
  headerButtons(tree).find(
    (node) => node.props["aria-label"] === "تنزيل Excel",
  );
function openTab(tree: ReturnType<typeof render>, id: string) {
  const tabs = nodes(tree).find((node) => node.type === Tabs)!;
  (tabs.props.onChange as (tab: string) => void)(id);
}
function choose(tree: ReturnType<typeof render>, preset: string) {
  const button = nodes(tree).find(
    (node) => node.type === Button && node.props["data-preset"] === preset,
  )!;
  (button.props.onClick as () => void)();
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
/** Runs the pending request with this answer and renders the result. */
async function answer(
  data: ReturnType<typeof reportsFixture> = reportsFixture(),
) {
  vi.mocked(getReports).mockResolvedValueOnce(data);
  render();
  hooks.effect!();
  await settle();
  return render();
}
const loaded = () => answer();
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
    hooks.branch = { id: testId(1), name: "Main Branch" };
    hooks.branchError = null;
    hooks.refreshBranches.mockClear();
    vi.mocked(getReports).mockReset();
    vi.mocked(cairoCalendarDate).mockReturnValue("2026-09-27");
  });
  it("hides the previous branch's figures while a new branch report is loading", async () => {
    await loaded();
    hooks.branch = { id: testId(2), name: "Other Branch" };
    const html = renderToStaticMarkup(render());
    expect(html).not.toContain("صافي المبيعات");
    expect(printButton(render()).props.disabled).toBe(true);
  });
  it("says there is no branch instead of asking for figures it cannot have", () => {
    hooks.branch = null;

    const html = renderToStaticMarkup(render());

    expect(html).toContain("لا يوجد فرع");
    expect(html).not.toContain("المبيعات");
    expect(vi.mocked(getReports)).not.toHaveBeenCalled();
  });
  it("says the branch list could not load, and offers to try again", async () => {
    hooks.branch = null;
    hooks.branchError = "تعذر تحميل الفروع";

    const tree = render();
    const html = renderToStaticMarkup(tree);

    // a failed load is not the same answer as an account with no branches
    expect(html).toContain("تعذر تحميل الفروع");
    expect(html).not.toContain("لا يوجد فرع");
    const retry = nodes(tree).find(
      (node) => node.type === Button && "onClick" in node.props,
    );
    expect(retry).toBeDefined();
    await (retry!.props.onClick as () => Promise<void>)();
    expect(hooks.refreshBranches).toHaveBeenCalled();
  });
  it("opens on this Cairo month's overview, even just after midnight", async () => {
    vi.mocked(cairoCalendarDate).mockReturnValue("2026-10-01");
    const html = renderToStaticMarkup(await loaded());
    expect(getReports).toHaveBeenCalledWith("2026-10-01", "2026-10-01");
    expect(html).toMatch(/aria-pressed="true"[^>]*data-preset="month"/);
    expect(html).toContain("صافي المبيعات");
    expect(html).toContain("المبيعات حسب الساعة");
  });
  it("reloads straight away when a preset is chosen, with no refresh button", async () => {
    const tree = await loaded();
    expect(renderToStaticMarkup(tree)).not.toContain("تحديث");
    choose(tree, "yesterday");
    await answer();
    expect(getReports).toHaveBeenLastCalledWith("2026-09-26", "2026-09-26");
    choose(render(), "week");
    await answer();
    // 2026-09-27 is a Sunday; the week began on Saturday the 26th
    expect(getReports).toHaveBeenLastCalledWith("2026-09-26", "2026-09-27");
  });
  it("shows the two dates only for a custom range, and reloads as they change", async () => {
    const tree = await loaded();
    expect(nodes(tree).some((node) => node.type === "input")).toBe(false);
    choose(tree, "custom");
    const custom = render();
    expect(nodes(custom).filter((node) => node.type === "input")).toHaveLength(
      2,
    );
    changeStart(custom, "2026-09-02");
    await answer();
    expect(getReports).toHaveBeenLastCalledWith("2026-09-02", "2026-09-27");
  });
  it("shows the loaded period in Arabic, without developer notes", async () => {
    const html = renderToStaticMarkup(await loaded());
    expect(html).toContain(
      `من ${cairoCalendarLabel("2026-09-01")} إلى ${cairoCalendarLabel("2026-09-10")}`,
    );
    expect(html).toContain("Main Branch");
    expect(html).toContain("وقت التحميل");
    expect(html).not.toContain("لم تتوفر بعد");
    expect(html).not.toContain("2026-09-01 — 2026-09-10");
  });
  it("blocks printing while reloading and after a failure, which can be retried", async () => {
    const tree = await loaded();
    vi.mocked(getReports).mockRejectedValueOnce(new Error("Offline"));
    choose(tree, "today");
    expect(printButton(render()).props.disabled).toBe(true);
    hooks.effect!();
    await settle();
    const failed = render();
    expect(printButton(failed).props.disabled).toBe(true);
    expect(renderToStaticMarkup(failed)).toContain("Offline");
    const retry = nodes(failed).find(
      (node) =>
        node.type === "button" && node.props.children === "إعادة المحاولة",
    )!;
    (retry.props.onClick as () => void)();
    const next = reportsFixture();
    next.range.from = "2026-09-27";
    await answer(next);
    expect(getReports).toHaveBeenLastCalledWith("2026-09-27", "2026-09-27");
    expect(printButton(render()).props.disabled).toBe(false);
  });
  it("discards a late response from an older range", async () => {
    let resolve!: (value: ReturnType<typeof reportsFixture>) => void;
    vi.mocked(getReports).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render();
    const cleanup = hooks.effect!();
    choose(render(), "yesterday");
    if (typeof cleanup === "function") cleanup();
    resolve(reportsFixture());
    await settle();
    expect(renderToStaticMarkup(render())).not.toContain("صافي المبيعات");
  });
  it("shows transfers and preparations under stock, with links on the desktop", async () => {
    const data = reportsFixture();
    data.operations.transfers = [
      { id: testId(4), createdByName: "Transfer Staff", totalCost: "14.00" },
    ];
    data.operations.preparations = [
      {
        id: testId(7),
        recipeName: "Dough",
        preparedByName: "Prep Staff",
        totalCost: "8.00",
      },
    ];
    await answer(data);
    openTab(render(), "stock");
    const html = renderToStaticMarkup(
      render({ documentHref: (document, id) => `/${document}/${id}` }),
    );
    expect(html).toContain("Transfer Staff");
    expect(html).toContain("Prep Staff");
    expect(html).toContain("Dough");
    expect(html).toContain(`href="/transfer/${testId(4)}"`);
    expect(html).not.toContain("ليس رقمًا");
  });
  it("shows uncounted cash in the complete shift table", async () => {
    const data = reportsFixture();
    data.sales.byShift = [
      {
        shiftId: testId(1),
        cashierName: "Cashier",
        status: "closed",
        actualCash: null,
        overShort: null,
      },
    ];
    await answer(data);
    openTab(render(), "employees");
    const html = renderToStaticMarkup(render());
    expect(html.match(/لم يُعدّ/g)).toHaveLength(2);
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
  it("downloads Excel only where offered, with exactly the rows on screen", async () => {
    const data = reportsFixture();
    data.stock.current = [
      { code: 1, name: "لبن", warehouse: "main", stockValue: "10.00" },
      { code: 2, name: "بن", warehouse: "cafe", stockValue: "5.00" },
    ];
    await answer(data);
    expect(excelButton(render())).toBeUndefined();
    const excelDownload = vi.fn<(report: ReportExport) => Promise<void>>(
      async () => undefined,
    );
    openTab(render({ excelDownload }), "stock");
    // the reader narrows the stock table to the café
    const table = nodes(render({ excelDownload })).find(
      (node) => node.props.title === "المخزون الحالي وقيمة FIFO",
    )!;
    (table.props.onView as (title: string, view: unknown) => void)(
      "المخزون الحالي وقيمة FIFO",
      { search: "", filters: { warehouse: "cafe" } },
    );

    const button = excelButton(render({ excelDownload }))!;
    expect(button.props.disabled).toBe(false);
    await (button.props.onClick as () => Promise<void>)();

    const report = excelDownload.mock.calls[0]![0];
    expect(report).toMatchObject({
      branchName: "Main Branch",
      from: "2026-09-01",
      to: "2026-09-10",
      section: "المخزون",
    });
    const stock = report.tables.find(
      (entry) => entry.title === "المخزون الحالي وقيمة FIFO",
    )!;
    expect(stock.rows.map((row) => row.name)).toEqual(["بن"]);
    expect(stock.details?.title).toBe("دفتر حركة المخزون");
    expect(report.tables.map((entry) => entry.title)).not.toContain(
      "حسب اليوم",
    );
  });
  it("says so when the Excel file could not be made", async () => {
    await loaded();
    const excelDownload = vi.fn(async () => {
      throw new Error("boom");
    });

    await (
      excelButton(render({ excelDownload }))!.props
        .onClick as () => Promise<void>
    )();

    expect(renderToStaticMarkup(render({ excelDownload }))).toContain(
      "تعذر تنزيل ملف Excel",
    );
  });
});

describe("overview figures", () => {
  beforeEach(() => {
    hooks.state.length = 0;
    hooks.effect = null;
    hooks.branch = { id: testId(1), name: "Main Branch" };
    vi.mocked(getReports).mockReset();
  });
  it("shows a rise, a fall, and no comparison without previous figures", () => {
    const now = periodFixture({ netSales: 150, expenses: 60, margin: 40 });
    const before = periodFixture({ netSales: 100, expenses: 50, margin: 42.5 });

    expect(figureChange("netSales", now, before)).toEqual({
      direction: "up",
      good: true,
      text: "٥٠٪",
    });
    // more expenses is bad news even though the figure went up
    expect(figureChange("expenses", now, before, true)).toMatchObject({
      direction: "up",
      good: false,
    });
    // a margin moves in points
    expect(figureChange("margin", now, before)).toMatchObject({
      direction: "down",
      good: false,
      text: "٢٫٥ نقطة",
    });
    expect(
      figureChange("netSales", now, periodFixture({ netSales: 0 })),
    ).toBeNull();
  });

  it("renders the change on each card, or says there is nothing to compare", async () => {
    const data = reportsFixture();
    data.overview.current = periodFixture({ netSales: 120 });
    data.overview.previous = {
      from: "2026-08-22",
      to: "2026-08-31",
      ...periodFixture({ netSales: 100, ordersCount: 0 }),
    };
    const html = renderToStaticMarkup(await answer(data));
    expect(html).toContain("زيادة ٢٠٪ عن الفترة السابقة");
    expect(html).toContain("لا توجد بيانات سابقة للمقارنة");
  });
});
