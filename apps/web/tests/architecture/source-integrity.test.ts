import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const workspaces = ["apps", "packages"];
const skippedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

// Everything this codebase writes for people to read is Arabic or plain ASCII.
// These ranges are what survives a wrong-codepage write: Arabic bytes read back
// as Latin-1 (the stocktake notes read "Ø¬Ø±Ø¯"), or the replacement character
// and stray ideographs a broken round-trip leaves behind. The multiplication and
// division signs are the only Latin-1 symbols the sources legitimately use.
const mangledText =
  /[\uFFFD\u0080-\u009F\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u02C0-\u02FF\u0400-\u04FF\u3000-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/u;

/** The files that ship: every package's `src`, which is where no test lives. */
function productionSources(): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) walk(path.join(directory, entry.name));
      } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        found.push(path.join(directory, entry.name));
      }
    }
  };

  for (const workspace of workspaces) {
    for (const packageName of fs.readdirSync(path.join(repoRoot, workspace))) {
      const source = path.join(repoRoot, workspace, packageName, "src");
      if (fs.existsSync(source)) walk(source);
    }
  }

  return found;
}

describe("source integrity", () => {
  it("keeps mangled text out of the shipped sources", () => {
    const offenders: string[] = [];

    for (const file of productionSources()) {
      fs.readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (mangledText.test(line)) {
            offenders.push(`${path.relative(repoRoot, file)}:${index + 1}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});