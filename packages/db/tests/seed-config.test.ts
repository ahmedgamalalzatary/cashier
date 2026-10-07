import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAdminSeedConfig } from "../src/seed-config.js";
import { seedAdmin, syncConfiguredAdmin } from "../src/seed-admin.js";

describe("admin seed configuration", () => {
  it("reads the initial admin credentials from environment values", () => {
    expect(
      getAdminSeedConfig({
        ADMIN_NAME: 'المدير العام',
        ADMIN_USERNAME: 'branch-admin',
        ADMIN_PASSWORD: 'strong-password-123',
      }),
    ).toEqual({
      name: 'المدير العام',
      username: 'branch-admin',
      password: 'strong-password-123',
    });
  });

  it("requires a username and a non-empty password", () => {
    expect(() =>
      getAdminSeedConfig({ ADMIN_PASSWORD: 'strong-password-123' }),
    ).toThrow('ADMIN_USERNAME');
    expect(() =>
      getAdminSeedConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: '' }),
    ).toThrow('ADMIN_PASSWORD');
  });
});

describe("seed module surface", () => {
  it("is importable without a database connection", () => {
    expect(typeof seedAdmin).toBe('function');
    expect(typeof syncConfiguredAdmin).toBe('function');
  });
});

describe("migration journal", () => {
  const journalPath = path.resolve(import.meta.dirname, "../drizzle/meta/_journal.json");

  it("ships migrations whose tags all appear in the journal", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>;
    };
    const tags = new Set(journal.entries.map((entry) => entry.tag));
    const files = fs
      .readdirSync(path.resolve(import.meta.dirname, "../drizzle"))
      .filter((name) => name.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(tags, `migration missing from the journal: ${file}`).toContain(
        file.replace(/\.sql$/, ""),
      );
    }
  });
});
