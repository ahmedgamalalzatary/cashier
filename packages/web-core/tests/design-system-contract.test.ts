import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

// Both Next apps carry their own copy of the design system. The staff app needs
// it as well as the online site, so a change that only reaches one of them is a
// bug waiting to happen.
const stylesheets = [
  "apps/web/src/app/globals.css",
  "apps/online-web/src/app/globals.css",
];

describe("design system contract", () => {
  it("tells Tailwind to scan the shared components from every app stylesheet", () => {
    for (const stylesheet of stylesheets) {
      const css = fs.readFileSync(path.join(repoRoot, stylesheet), "utf8");
      const declared = [...css.matchAll(/@source\s+"([^"]+)"/g)].map(([, source]) =>
        path.resolve(path.dirname(path.join(repoRoot, stylesheet)), source),
      );

      // The shared components are transpiled from source outside the app
      // directory, so Tailwind never scans them on its own. Without this every
      // utility only they use is missing from the built CSS and the pages
      // render unstyled.
      expect(
        declared.some((source) => source.endsWith(path.join("packages", "web-core", "src"))),
        `${stylesheet} must declare @source pointing at packages/web-core/src`,
      ).toBe(true);
    }
  });

  it("keeps both copies of the stylesheet identical", () => {
    const [first, ...rest] = stylesheets.map((stylesheet) =>
      fs.readFileSync(path.join(repoRoot, stylesheet), "utf8"),
    );

    for (const other of rest) {
      expect(other, "the staff and online stylesheets have drifted apart").toBe(first);
    }
  });
});