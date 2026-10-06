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
  it("hints users to approve invoice lines before submitting", () => {
    const source = readFileSync(
      new URL(
        "../../../src/components/transfers/transfer-form-modal.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("اعتماد البنود المحددة");
    expect(source).toMatch(/tab === "invoice"[\s\S]{0,400}اعتماد البنود المحددة/);
  });
});
