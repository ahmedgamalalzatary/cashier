import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("API runtime image", () => {
  it("builds the shared package before the Docker web build", async () => {
    const dockerfile = await readFile(
      new URL("../../../../../dockerfile.web", import.meta.url),
      "utf8",
    );

    expect(dockerfile).toContain(
      "RUN pnpm --filter @cashier/shared build && pnpm --filter @cashier/web build",
    );
  });

  it("runs the cache worker alongside the API during local development", async () => {
    const rootPackage = JSON.parse(
      await readFile(
        new URL("../../../../../package.json", import.meta.url),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };
    const apiPackage = JSON.parse(
      await readFile(
        new URL("../../../../../apps/api/package.json", import.meta.url),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };
    const turbo = JSON.parse(
      await readFile(
        new URL("../../../../../turbo.json", import.meta.url),
        "utf8",
      ),
    ) as { tasks?: Record<string, { persistent?: boolean }> };

    expect(rootPackage.scripts?.dev).toBe("turbo run dev dev:worker");
    expect(apiPackage.scripts?.["dev:worker"]).toContain("src/worker.ts");
    expect(turbo.tasks?.["dev:worker"]?.persistent).toBe(true);
  });

  it("builds and copies the compiled shared runtime package", async () => {
    const dockerfile = await readFile(
      new URL("../../../../../dockerfile.api", import.meta.url),
      "utf8",
    );
    const sharedPackage = JSON.parse(
      await readFile(
        new URL("../../../../../packages/shared/package.json", import.meta.url),
        "utf8",
      ),
    ) as { main?: string; scripts?: { build?: string } };
    const apiPackage = JSON.parse(
      await readFile(
        new URL("../../../../../apps/api/package.json", import.meta.url),
        "utf8",
      ),
    ) as { scripts?: { build?: string } };
    const turbo = JSON.parse(
      await readFile(
        new URL("../../../../../turbo.json", import.meta.url),
        "utf8",
      ),
    ) as { tasks?: Record<string, { dependsOn?: string[] }> };

    expect(sharedPackage.main).toBe("dist/index.js");
    expect(sharedPackage.scripts?.build).toBeDefined();
    expect(apiPackage.scripts?.build).toContain(
      "pnpm --filter @cashier/shared build",
    );
    expect(turbo.tasks?.dev?.dependsOn ?? []).toContain("^build");
    expect(turbo.tasks?.test?.dependsOn ?? []).toContain("^build");
    expect(dockerfile).toContain(
      "COPY --from=build /app/packages/shared ./packages/shared",
    );
  });

  it("passes external-order credentials only to the API container", async () => {
    const compose = await readFile(
      new URL("../../../../../docker-compose.yml", import.meta.url),
      "utf8",
    );
    const example = await readFile(
      new URL("../../../../../.env.example", import.meta.url),
      "utf8",
    );

    for (const name of [
      "EXTERNAL_ORDERS_BASE_URL",
      "EXTERNAL_ORDERS_PHONE_NUMBER",
      "EXTERNAL_ORDERS_PASSWORD",
    ]) {
      expect(compose).toContain(`${name}: \${${name}:?${name} is required}`);
      expect(example).toContain(`${name}=`);
    }
    expect(compose.indexOf("EXTERNAL_ORDERS_PASSWORD")).toBeLessThan(
      compose.indexOf("\n  web:"),
    );
  });

  it("runs the cache worker as a dedicated service from the API image", async () => {
    const compose = await readFile(
      new URL("../../../../../docker-compose.yml", import.meta.url),
      "utf8",
    );
    const apiPackage = JSON.parse(
      await readFile(
        new URL("../../../../../apps/api/package.json", import.meta.url),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };

    expect(compose).toContain("  cache-worker:");
    expect(compose).toContain('command: ["node", "dist/worker.js"]');
    expect(apiPackage.scripts?.["start:worker"]).toBe("node dist/worker.js");
  });
});
