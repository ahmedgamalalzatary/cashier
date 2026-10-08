import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("web build targets", () => {
  it("keeps the desktop bundle a static export", () => {
    const config = fs.readFileSync(
      path.resolve(process.cwd(), "next.config.ts"),
      "utf8",
    );

    expect(config).toContain('process.env.NEXT_OUTPUT_MODE === "standalone"');
    expect(config).toContain('isStandalone ? "standalone" : "export"');
  });

  it("ships the online site as a standalone server image", () => {
    const dockerfile = fs.readFileSync(
      path.resolve(process.cwd(), "../../dockerfile.online-web"),
      "utf8",
    );

    expect(dockerfile).toContain(".next/standalone");
    expect(dockerfile).toContain('CMD ["node", "apps/online-web/server.js"]');
  });
});