import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "../../src");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("web source boundaries", () => {
  it("does not describe completed sections as under construction", () => {
    const source = readFileSync(join(sourceRoot, "app/page.tsx"), "utf8");
    expect(source).not.toContain("باقي الأقسام قيد الإنشاء");
  });

  it("keeps only Next.js route modules in the app directory", () => {
    const routeModuleNames = new Set([
      "default.tsx",
      "error.tsx",
      "layout.tsx",
      "loading.tsx",
      "not-found.tsx",
      "page.tsx",
      "route.ts",
      "template.tsx",
    ]);
    const unexpected = filesUnder(join(sourceRoot, "app"))
      .filter((path) => [".ts", ".tsx"].includes(extname(path)))
      .filter((path) => !routeModuleNames.has(basename(path)))
      .map((path) => path.slice(sourceRoot.length + 1).replaceAll("\\", "/"));

    expect(unexpected).toEqual([]);
  });

  it("keeps raw API paths out of routes and components", () => {
    const offenders = ["app", "components"].flatMap((directory) =>
      filesUnder(join(sourceRoot, directory))
        .filter((path) => [".ts", ".tsx"].includes(extname(path)))
        .filter((path) => {
          const source = readFileSync(path, "utf8");
          return source.includes("/api/") || source.includes("@/lib/api");
        })
        .map((path) => path.slice(sourceRoot.length + 1).replaceAll("\\", "/")),
    );

    expect(offenders).toEqual([]);
  });
});
