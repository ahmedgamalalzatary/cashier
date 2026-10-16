import { testId } from "@cashier/shared/test-support";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportTable } from '../../../src/components/reports/report-table';
import type { Column, TableView } from "../../../src/models/reports-model";

const render = (
  rows: Record<string, string | number | null>[],
  column: Partial<Column> = {},
) =>
  renderToStaticMarkup(
    <ReportTable
      title="اختبار"
      rows={rows}
      columns={[{ key: "value", label: "القيمة", kind: "event", ...column }]}
    />,
  );

describe("ReportTable event labels", () => {
  it("labels a salary payment instead of printing the raw code", () => {
    const html = render([{ value: "salary_payment" }]);

    expect(html).toContain("صرف راتب");
    expect(html).not.toContain("salary_payment");
  });

  it("labels a salary advance instead of printing the raw code", () => {
    const html = render([{ value: "salary_advance" }]);

    expect(html).toContain("سلفة");
    expect(html).not.toContain("salary_advance");
  });

  it("labels stocktake shortage and surplus movements", () => {
    const html = render([{ value: "stocktake_shortage" }]);
    const surplusHtml = render([{ value: "stocktake_surplus" }]);

    expect(html).toContain("عجز جرد");
    expect(surplusHtml).toContain("زيادة جرد");
  });

  it("labels a purchase invoice reference", () => {
    const html = render([{ value: "purchase_invoice" }]);

    expect(html).toContain("فاتورة شراء");
    expect(html).not.toContain("purchase_invoice");
  });

  it("labels a preparation reference", () => {
    const html = render([{ value: "preparation" }]);

    expect(html).toContain("تحضير");
    expect(html).not.toContain("preparation");
  });

  it("labels a stocktake reference", () => {
    const html = render([{ value: "stocktake" }], { labelSet: "reference" });

    expect(html).toContain("جرد");
    expect(html).not.toContain(">stocktake<");
  });

  it("labels a stocktake document kind", () => {
    const html = render([{ value: "stocktake" }], {
      labelSet: "stocktakeKind",
    });

    expect(html).toContain("جرد مخزون");
  });

  it("labels a manual stocktake document kind", () => {
    const html = render([{ value: "manual" }], { labelSet: "stocktakeKind" });

    expect(html).toContain("تسوية يدوية");
  });

  it("labels each waste reason code", () => {
    const waste = (value: string) =>
      render([{ value }], { labelSet: "wasteReason" });

    expect(waste("expired")).toContain("منتهي الصلاحية");
    expect(waste("damaged")).toContain("تالف");
    expect(waste("preparation_mistake")).toContain("خطأ تحضير");
    expect(waste("spill")).toContain("انسكاب");
    expect(waste("other")).toContain("سبب آخر");
  });

  // A refund reason is free-typed text, so the waste codes must not rewrite it.
  it("leaves a free-typed refund reason untouched", () => {
    const html = render([{ value: "الزبون غير راضٍ" }], {
      labelSet: "wasteReason",
    });

    expect(html).toContain("الزبون غير راضٍ");
  });

  it("labels a salary history payment row", () => {
    const html = render([{ value: "payment" }], { labelSet: "salaryHistory" });

    expect(html).toContain("صرف راتب");
    expect(html).not.toContain("payment");
  });

  it("labels a salary history advance row", () => {
    const html = render([{ value: "advance" }], { labelSet: "salaryHistory" });

    expect(html).toContain("سلفة");
    expect(html).not.toContain("advance");
  });

  it("labels a salary adjustment bonus row", () => {
    const html = render([{ value: "bonus" }], { labelSet: "salaryHistory" });

    expect(html).toContain("مكافأة");
    expect(html).not.toContain("bonus");
  });

  it("labels a salary adjustment deduction row", () => {
    const html = render([{ value: "deduction" }], {
      labelSet: "salaryHistory",
    });

    expect(html).toContain("خصم");
    expect(html).not.toContain("deduction");
  });

  it("keeps an unknown code visible so a missing label is noticed", () => {
    const html = render([{ value: "totally_unknown_code" }]);

    expect(html).toContain("totally_unknown_code");
  });

  it("labels document status and shift actions in Arabic", () => {
    expect(
      render([{ value: "approved" }], {
        labelSet: "status" as Column["labelSet"],
      }),
    ).toContain("معتمد");
    expect(
      render([{ value: "admin_close" }], {
        labelSet: "shiftAction" as Column["labelSet"],
      }),
    ).toContain("إغلاق إداري");
  });

  it("renders timestamps in Cairo and calendar dates without a midnight time", () => {
    const expected = new Date("2026-07-01T22:30:00Z").toLocaleString("ar-EG", {
      timeZone: "Africa/Cairo",
    });
    expect(
      render([{ value: "2026-07-01T22:30:00Z" }], { kind: "date" }),
    ).toContain(expected);
    const dateOnly = render([{ value: "2026-07-01" }], { kind: "date" });
    expect(dateOnly).not.toMatch(/[٠-٩]+:[٠-٩]+/);
  });
});
describe("document references", () => {
  const order = testId(0x1b4c5d);
  const html = (
    row: Record<string, string | number | null>,
    column: Partial<Column>,
    documentHref?: (document: string, id: string) => string,
  ) =>
    renderToStaticMarkup(
      <ReportTable
        title="مراجع"
        rows={[row]}
        columns={[{ key: "id", label: "المرجع", kind: "reference", ...column }]}
        documentHref={documentHref}
      />,
    );

  it("shows the document's own number when it has one", () => {
    const markup = html({ id: order, orderNumber: "POS-20260910-AB12" }, {
      labelKey: "orderNumber",
    });
    expect(markup).toContain("POS-20260910-AB12");
    expect(markup).not.toContain(order);
  });

  it("falls back to a short code instead of the raw ID", () => {
    const markup = html({ id: order }, {});
    expect(markup).toContain("#1B4C5D");
    expect(markup).not.toContain(order);
  });

  it("links to the document where the site has a page for it", () => {
    const href = (document: string, id: string) => `/${document}?id=${id}`;
    expect(html({ id: order }, { document: "order" }, href)).toContain(
      `href="/order?id=${order}"`,
    );
    // the online site passes no pages, so the reference stays plain text
    expect(html({ id: order }, { document: "order" })).not.toContain("href");
  });

  it("picks the document from the row's own type for mixed ledgers", () => {
    const href = (document: string, id: string) => `/${document}?id=${id}`;
    const column = { documentKey: "referenceType" };
    expect(html({ id: order, referenceType: "purchase_invoice" }, column, href)).toContain(
      `href="/purchase?id=${order}"`,
    );
    // a type with no page keeps the short code without a link
    expect(html({ id: order, referenceType: "waste" }, column, href)).not.toContain(
      "href",
    );
  });

  it("shows a dash when there is no document", () => {
    expect(html({ id: null }, {})).toContain("—");
  });
});

describe("uncounted cash", () => {
  it("says the drawer was not counted instead of showing a zero", () => {
    const markup = renderToStaticMarkup(
      <ReportTable
        title="Shift over/short"
        rows={[
          {
            shiftId: testId(1),
            expectedCash: "500.00",
            actualCash: null,
            overShort: null,
          },
        ]}
        columns={[
          { key: "expectedCash", label: "Expected", kind: "money" },
          { key: "actualCash", label: "Actual", kind: "uncountedMoney" },
          { key: "overShort", label: "Over/short", kind: "uncountedMoney" },
        ]}
      />,
    );

    expect(markup).toContain("لم يُعدّ");
    // the expected figure is still a real number
    expect(markup).toContain("٥٠٠٫٠٠");
  });

  it("still formats a counted amount", () => {
    const markup = renderToStaticMarkup(
      <ReportTable
        title="Shift over/short"
        rows={[{ shiftId: testId(1), actualCash: "900.00", overShort: "400.00" }]}
        columns={[{ key: "actualCash", label: "Actual", kind: "uncountedMoney" }]}
      />,
    );

    expect(markup).not.toContain("لم يُعدّ");
  });
});
describe("table toolkit", () => {
  type Element = ReactElement<Record<string, unknown>>;
  const elements = (node: ReactNode): Element[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    // function components are expanded so their markup can be inspected
    if (typeof element.type === "function")
      return elements((element.type as (props: unknown) => ReactNode)(element.props));
    return [element, ...elements(element.props.children as ReactNode)];
  };
  const table = {
    title: "الهالك",
    rows: [
      { name: "لبن", warehouse: "main", amount: "10.00" },
      { name: "بن", warehouse: "cafe", amount: "5.50" },
      { name: "سكر", warehouse: "main", amount: "2.00" },
    ],
    columns: [
      { key: "name", label: "الصنف" },
      { key: "warehouse", label: "المخزن", kind: "warehouse", filter: true },
      { key: "amount", label: "التكلفة", kind: "money", total: true },
    ] as Column[],
  };
  const tree = (views: Record<string, TableView> = {}, onView = vi.fn()) =>
    elements(ReportTable({ ...table, views, onView }));

  it("reports a search as the reader types", () => {
    const onView = vi.fn();
    const search = tree({}, onView).find(
      (node) => node.type === "input" && node.props.type === "search",
    )!;
    (search.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: "لبن" },
    });
    expect(onView).toHaveBeenCalledWith("الهالك", { search: "لبن", filters: {} });
  });

  it("sorts by a clicked header, then reverses on the next click", () => {
    const onView = vi.fn();
    const header = (views: Record<string, TableView>) =>
      tree(views, onView).find(
        (node) => node.type === "button" && node.props["data-sort"] === "amount",
      )!;
    (header({}).props.onClick as () => void)();
    expect(onView).toHaveBeenLastCalledWith("الهالك", {
      search: "",
      filters: {},
      sort: { key: "amount", direction: "asc" },
    });
    const sorted = { الهالك: { search: "", filters: {}, sort: { key: "amount", direction: "asc" as const } } };
    (header(sorted).props.onClick as () => void)();
    expect(onView).toHaveBeenLastCalledWith("الهالك", {
      search: "",
      filters: {},
      sort: { key: "amount", direction: "desc" },
    });
    const html = renderToStaticMarkup(<ReportTable {...table} views={sorted} />);
    expect(html).toContain('aria-sort="ascending"');
    expect(html.indexOf("سكر")).toBeLessThan(html.indexOf("لبن"));
  });

  it("filters by a column's values and totals only what is shown", () => {
    const onView = vi.fn();
    const select = tree({}, onView).find((node) => node.type === "select")!;
    (select.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: "main" },
    });
    expect(onView).toHaveBeenCalledWith("الهالك", {
      search: "",
      filters: { warehouse: "main" },
    });
    const html = renderToStaticMarkup(
      <ReportTable {...table} views={{ الهالك: { search: "", filters: { warehouse: "main" } } }} />,
    );
    expect(html).not.toContain(">بن<");
    expect(html).toContain(">لبن<");
    expect(html).toContain("الإجمالي");
    expect(html).toContain("١٢٫٠٠");
    expect(html).toContain("٢ من ٣ سجل");
  });

  it("says when nothing matches, apart from when there is no data at all", () => {
    expect(
      renderToStaticMarkup(
        <ReportTable {...table} views={{ الهالك: { search: "غير موجود", filters: {} } }} />,
      ),
    ).toContain("لا توجد نتائج مطابقة");
    expect(renderToStaticMarkup(<ReportTable {...table} rows={[]} />)).toContain(
      "لا توجد بيانات",
    );
  });

  it("folds the raw ledger under the summary in a details section", () => {
    const html = renderToStaticMarkup(
      <ReportTable
        {...table}
        details={{ title: "دفتر الهالك", rows: [{ name: "لبن" }], columns: [{ key: "name", label: "الصنف" }] }}
      />,
    );
    expect(html).toMatch(/<details[^>]*>[\s\S]*التفاصيل[\s\S]*دفتر الهالك/);
  });
});
