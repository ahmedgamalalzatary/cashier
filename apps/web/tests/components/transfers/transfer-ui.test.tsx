import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "../../../src/components/ui/modal";
import {
  CafeHeaderActions,
  CafeTabs,
} from "../../../src/components/transfers/cafe-controls";

describe("transfer UI accessibility", () => {
  it("shows direct transfers only to admins", () => {
    const cashier = renderToStaticMarkup(
      <CafeHeaderActions
        isAdmin={false}
        onRequest={() => undefined}
        onDirect={() => undefined}
      />,
    );
    const admin = renderToStaticMarkup(
      <CafeHeaderActions
        isAdmin
        onRequest={() => undefined}
        onDirect={() => undefined}
      />,
    );

    expect(cashier).toContain("طلب تحويل");
    expect(cashier).not.toContain("تحويل مباشر");
    expect(admin).toContain("تحويل مباشر");
  });

  it("exposes the selected cafe section as an accessible tab", () => {
    const html = renderToStaticMarkup(
      <CafeTabs active="requests" pendingRequests={2} onChange={() => undefined} />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="cafe-requests-panel"');
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
