import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WasteService external-product errors", () => {
  it("describes external products instead of recipe products", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/modules/waste/waste.service.ts"),
      "utf8",
    );
    expect(source).toContain("هالك المنتج الخارجي يسجل في مخزن الكافيه فقط");
    expect(source).toContain(
      "المنتج الخارجي أو المقاس المحدد لا يحتوي على مكونات",
    );
    expect(source).not.toContain("هالك منتج الوصفة يسجل في مخزن الكافيه فقط");
  });
});
