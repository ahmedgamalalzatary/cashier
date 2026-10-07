import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "../../../src/components/ui/modal";

describe("transfer UI accessibility", () => {
  it("shows direct transfers only to admins", () => {
    const page = readFileSync(
      new URL("../../../src/app/transfers/page.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toMatch(/\{isAdmin && \([\s\S]{0,200}تحويل مباشر/);
    expect(page).toContain("طلب تحويل");
  });

  it("keeps modal content scrollable within a short viewport", () => {
    const html = renderToStaticMarkup(
      <Modal title="اختبار" open onClose={() => undefined}>
        <div>المحتوى</div>
      </Modal>,
    );

    expect(html).toContain("max-h-[calc(100dvh-2rem)]");
    expect(html).toContain("overflow-y-auto");
  });
});

describe("transfer invoice tab", () => {
  const readSource = (relative: string) =>
    readFileSync(new URL(`../../../src/${relative}`, import.meta.url), "utf8");

  it("hints users to approve invoice lines before submitting", () => {
    const source = readSource("components/transfers/transfer-form-modal.tsx");

    expect(source).toContain("اعتماد البنود المحددة");
    expect(source).toMatch(/tab === "invoice"[\s\S]{0,400}اعتماد البنود المحددة/);
  });

  it("labels the source switch without the duplicated word", () => {
    const source = readSource("components/transfers/transfer-form-modal.tsx");

    expect(source).not.toContain("صنف صنف");
    expect(source).toContain("إدخال يدوي");
  });
});

describe("purchase invoice to cafe transfer link", () => {
  const readSource = (relative: string) =>
    readFileSync(new URL(`../../../src/${relative}`, import.meta.url), "utf8");

  it("sends the source invoice with a direct transfer built from invoice rows", () => {
    const modal = readSource("components/transfers/transfer-form-modal.tsx");

    expect(modal).toContain("appliedInvoiceId");
    expect(modal).toContain("purchaseInvoiceId");
  });

  it("offers only the invoice remainder, capped by main stock", () => {
    const model = readSource("models/transfer-model.ts");

    expect(model).toContain("transferredToCafeQuantity");
    expect(model).toContain("remainingQuantity: owedQuantity");
  });

  it("shows what the invoice already sent to the cafe and what is left", () => {
    const page = readSource("app/purchases/detail/page.tsx");

    expect(page).toContain("transferredToCafeQuantity");
    expect(page).toContain("حُوِّل للكافيه");
    expect(page).toContain("المتبقي للكافيه");
  });

  it("stops offering the transfer once every line is fully transferred", () => {
    const page = readSource("app/purchases/detail/page.tsx");

    expect(page).toContain("canTransferToCafe");
    expect(page).toContain("لم يتبقَّ رصيد للتحويل للكافيه");
  });

  it("lists the transfers the invoice paid for, linking to each one", () => {
    const page = readSource("app/purchases/detail/page.tsx");

    expect(page).toContain("invoice.transfers");
    expect(page).toContain("/transfers/detail?id=");
  });
});
