import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { hasLivingProcess } = createRequire(import.meta.url)(
  "../../scripts/process-liveness.cjs",
) as {
  hasLivingProcess: (
    marker: string,
    io?: {
      pid?: number | string;
      readdirSync?: (dir: string) => string[];
      readFileSync?: (path: string, encoding: string) => string;
    },
  ) => boolean;
};

function proc(
  pid: number,
  entries: Record<string, string>,
): {
  pid: number;
  readdirSync: (dir: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
} {
  return {
    pid,
    readdirSync: () => Object.keys(entries),
    readFileSync: (path) => {
      const match = /\/proc\/(\d+)\/cmdline$/.exec(path);
      const cmdline = match ? entries[match[1]] : undefined;
      if (cmdline === undefined) throw new Error("ENOENT");
      return cmdline;
    },
  };
}

describe("hasLivingProcess", () => {
  it("does not treat the probe itself as the watched process", () => {
    expect(
      hasLivingProcess(
        "dist/worker.js",
        proc(9, {
          "9": "node\0scripts/process-liveness.cjs\0dist/worker.js\0",
        }),
      ),
    ).toBe(false);
  });

  it("reports healthy when another process has the marker as an argument", () => {
    expect(
      hasLivingProcess(
        "dist/worker.js",
        proc(9, {
          "9": "node\0scripts/process-liveness.cjs\0dist/worker.js\0",
          "40": "node\0dist/worker.js\0",
        }),
      ),
    ).toBe(true);
  });

  it("matches drizzle-kit from a path argument", () => {
    expect(
      hasLivingProcess(
        "drizzle-kit",
        proc(9, {
          "9": "node\0-e\0includes('drizzle-kit')\0",
          "18": "node\0/app/node_modules/drizzle-kit/bin.cjs\0migrate\0",
        }),
      ),
    ).toBe(true);
  });

  it("ignores node -e scripts whose source text mentions the marker", () => {
    expect(
      hasLivingProcess(
        "dist/worker.js",
        proc(9, {
          "9": "node\0scripts/process-liveness.cjs\0dist/worker.js\0",
          "22": "node\0-e\0let ok=false;/* dist/worker.js */\0",
        }),
      ),
    ).toBe(false);
  });
});
