import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabPanel, Tabs } from "../../../src/components/ui/tabs";

const items = [
  { id: "cashier", label: "طلبات الكاشير" },
  { id: "online", label: "طلبات الأونلاين", badge: 2 },
] as const;

describe("shared tabs", () => {
  it("renders keyboard-addressable tabs tied to the panel they control", () => {
    const html = renderToStaticMarkup(
      <Tabs
        idPrefix="orders"
        items={items}
        active="cashier"
        onChange={() => undefined}
        ariaLabel="مصدر الطلبات"
      />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="orders-cashier-tab"');
    expect(html).toContain('id="orders-online-tab"');
    expect(html).toMatch(
      /id="orders-cashier-tab"[^>]*aria-selected="true"[^>]*aria-controls="orders-panel"/,
    );
    // only the selected tab points at the rendered panel
    expect(html.match(/aria-controls=/g)).toHaveLength(1);
    expect(html).toContain(">2<");
  });

  it("labels the panel with the selected tab", () => {
    const html = renderToStaticMarkup(
      <TabPanel idPrefix="orders" active="online">
        <p>المحتوى</p>
      </TabPanel>,
    );

    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="orders-panel"');
    expect(html).toContain('aria-labelledby="orders-online-tab"');
  });
});
