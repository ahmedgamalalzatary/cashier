import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportTable } from '../../../src/components/reports/report-table';
import type { Column } from '../../../src/models/reports-model';

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