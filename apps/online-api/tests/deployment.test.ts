import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) =>
  fs.readFileSync(path.join(repoRoot, file), "utf8");

const compose = read("docker-compose.yml");

/** The service keys Compose will create, read from the file itself. */
function services() {
  const block = compose.split(/^services:\s*$/m)[1].split(/^\S/m)[0];
  return block
    .split("\n")
    .map((line) => /^ {2}([a-z0-9-]+):/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
}

function section(service: string) {
  const start = compose.search(new RegExp(`^ {2}${service}:\\s*$`, "m"));
  if (start < 0) throw new Error(`service ${service} is missing`);
  const rest = compose.slice(start);
  const next = rest.slice(1).search(/^ {2}[a-z0-9-]+:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("VPS deployment", () => {
  it("runs only the services the online site needs", () => {
    expect(services()).toEqual([
      "mysql",
      "migrate",
      "online-api",
      "online-web",
    ]);
  });

  it("keeps the removed shop services and their images out of the repository", () => {
    expect(fs.existsSync(path.join(repoRoot, "dockerfile.api"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, "dockerfile.web"))).toBe(false);
  });

  it("starts the online API only after the migration finished, behind loopback", () => {
    const api = section("online-api");

    expect(api).toContain("dockerfile.online-api");
    expect(api).toContain("127.0.0.1:4010:4000");
    expect(api).toMatch(
      /depends_on:\s*\n {6}migrate:\s*\n {8}condition: service_completed_successfully/,
    );
    expect(api).toContain('TRUST_PROXY: "true"');
  });

  it("serves the online site behind loopback on the port the host proxies", () => {
    expect(section("online-web")).toContain("127.0.0.1:3010:3000");
  });

  it("keeps the database in its persistent volume", () => {
    expect(section("mysql")).toContain("mysql_data:/var/lib/mysql");
  });

  it("watches the migration job for a process that is still working", () => {
    expect(section("migrate")).toContain(
      "/app/packages/db/scripts/process-liveness.cjs",
    );
  });

  it("builds an API image that migrates and then serves", () => {
    const dockerfile = read("dockerfile.online-api");

    expect(dockerfile).toContain("AS migrate");
    expect(dockerfile).toContain('CMD ["pnpm", "db:migrate"]');
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
    expect(dockerfile).toContain("packages/db/scripts");
  });

  it("seeds the online super-admin through the configuration check every API uses", () => {
    // Building the seed inline skipped the password-length warning, so a
    // configured password bcrypt cannot hold started online with no warning.
    const entry = read("apps/online-api/src/index.ts");

    expect(entry).toContain("getAdminSeedConfig({");
    expect(entry).toContain("ADMIN_PASSWORD: environment.ADMIN_PASSWORD");
    expect(entry).not.toMatch(/syncConfiguredAdmin\(\s*db,\s*\{\s*\n\s*name:/);
  });

  it("ships the scripts the restore procedure depends on", () => {
    const runbook = read("docs/docker.md");

    expect(runbook).toContain("scripts/read-prod-env.sh");
    expect(runbook).toContain("scripts/database-create-sql.sh");
    expect(fs.existsSync(path.join(repoRoot, "scripts/read-prod-env.sh"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(repoRoot, "scripts/database-create-sql.sh")),
    ).toBe(true);
  });

  it("does not parse the settings file with grep, cut, or a hard-coded collation", () => {
    const runbook = read("docs/docker.md");

    expect(runbook).not.toMatch(/grep -E '\^MYSQL_/);
    expect(runbook).not.toMatch(/tr -d/);
    // a collation typed into the runbook is a claim about every database
    expect(runbook).not.toContain("utf8mb4_0900_ai_ci");
  });

  it("checks that a dump is complete before anything destructive follows", () => {
    const runbook = read("docs/docker.md");

    expect(runbook).toContain("-- Dump completed");
    const checked = runbook.indexOf("-- Dump completed");
    const dropped = runbook.indexOf("DROP DATABASE IF EXISTS");
    expect(checked).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(checked);
  });

  it("builds a self-contained site image that needs no API URL at runtime", () => {
    const dockerfile = read("dockerfile.online-web");

    expect(dockerfile).toContain(".next/standalone");
    expect(dockerfile).toContain(".next/static");
    expect(dockerfile).toContain('CMD ["node", "apps/online-web/server.js"]');
    expect(dockerfile).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
