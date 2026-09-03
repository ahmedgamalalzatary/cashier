import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("web build targets", () => {
  it("keeps static export as the default and enables standalone only for Docker", () => {
    const config = fs.readFileSync(
      path.resolve(process.cwd(), "next.config.ts"),
      "utf8",
    );
    const dockerfile = fs.readFileSync(
      path.resolve(process.cwd(), "../../dockerfile.web"),
      "utf8",
    );

    expect(config).toContain('process.env.NEXT_OUTPUT_MODE === "standalone"');
    expect(config).toContain('isStandalone ? "standalone" : "export"');
    expect(dockerfile).toContain("ENV NEXT_OUTPUT_MODE=standalone");
  });
});
