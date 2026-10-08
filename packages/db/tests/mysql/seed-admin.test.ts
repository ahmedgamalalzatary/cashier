import { it, testBranchValues } from "../support/ids.js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { db } from "../support/database.js";
import { users } from "../../src/schema.js";
import { seedAdmin, syncConfiguredAdmin } from "../../src/seed-admin.js";

const configuredAdmin = {
  name: "مدير الفرع",
  username: "configured-admin",
  password: "configured-password",
};

async function admins() {
  return db.select().from(users).where(eq(users.role, "admin"));
}

describe("seedAdmin", () => {
  it("creates the configured admin when no admin exists", async () => {
    const result = await seedAdmin(db, configuredAdmin);
    const [user] = await admins();

    expect(result).toBe("created");
    expect(user).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      role: "admin",
      isSuperAdmin: true,
    });
    expect(
      await bcrypt.compare(configuredAdmin.password, user.passwordHash),
    ).toBe(true);
  });

  it("updates the existing admin from the configured environment values", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: "Old admin",
        username: "old-admin",
        passwordHash: await bcrypt.hash("old-password", 4),
        tokenVersion: 3,
        role: "admin",
        isActive: false,
      }),
    );

    const result = await seedAdmin(db, configuredAdmin);
    const rows = await admins();

    expect(result).toBe("updated");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      isActive: true,
      isSuperAdmin: true,
      tokenVersion: 4,
    });
    expect(
      await bcrypt.compare(configuredAdmin.password, rows[0].passwordHash),
    ).toBe(true);
  });

  it("allows the configured admin username to match a local cashier", async () => {
    await db.insert(users).values(
      testBranchValues([
        {
          name: "Existing admin",
          username: "old-admin",
          passwordHash: await bcrypt.hash("old-password", 4),
          role: "admin",
        },
        {
          name: "Conflicting cashier",
          username: configuredAdmin.username,
          passwordHash: await bcrypt.hash("cashier-password", 4),
          role: "cashier",
        },
      ]),
    );

    await expect(seedAdmin(db, configuredAdmin)).resolves.toBe("updated");
    const [admin] = await admins();
    expect(admin).toMatchObject({
      username: configuredAdmin.username,
      role: "admin",
      branchId: null,
    });
    const [cashier] = await db
      .select()
      .from(users)
      .where(eq(users.role, "cashier"));
    expect(cashier.username).toBe(configuredAdmin.username);
    expect(await bcrypt.compare("cashier-password", cashier.passwordHash)).toBe(
      true,
    );
  });

  it("updates the admin matching the configured username when several admins exist", async () => {
    await db.insert(users).values(
      testBranchValues([
        {
          name: "First admin",
          username: "first-admin",
          passwordHash: await bcrypt.hash("first-password", 4),
          role: "admin",
        },
        {
          name: "Configured admin before seed",
          username: configuredAdmin.username,
          passwordHash: await bcrypt.hash("old-password", 4),
          role: "admin",
        },
      ]),
    );

    await expect(seedAdmin(db, configuredAdmin)).resolves.toBe("updated");
    const rows = await admins();
    expect(rows.find((row) => row.username === "first-admin")).toMatchObject({
      name: "First admin",
      isSuperAdmin: false,
    });
    expect(
      rows.find((row) => row.username === configuredAdmin.username),
    ).toMatchObject({ name: configuredAdmin.name, isSuperAdmin: true });
  });

  it("creates a flagged super-admin when no admin matches the configured username", async () => {
    await db.insert(users).values(
      testBranchValues([
        {
          name: "First admin",
          username: "first-admin",
          passwordHash: await bcrypt.hash("first-password", 4),
          role: "admin",
        },
        {
          name: "Second admin",
          username: "second-admin",
          passwordHash: await bcrypt.hash("second-password", 4),
          role: "admin",
        },
      ]),
    );

    await expect(seedAdmin(db, configuredAdmin)).resolves.toBe("created");
    const rows = await admins();
    expect(rows).toHaveLength(3);
    const flagged = rows.filter((row) => row.isSuperAdmin);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      username: configuredAdmin.username,
      isActive: true,
    });
  });
});

describe.each([
  ["manual seed", seedAdmin],
  ["boot sync", syncConfiguredAdmin],
] as const)("%s role-aware admin resolution", (_name, action) => {
  it("creates a separate global admin when the only username owner is a cashier", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: "Cashier",
        username: configuredAdmin.username,
        role: "cashier",
        passwordHash: await bcrypt.hash("cashier-password", 4),
        tokenVersion: 5,
      }),
    );
    const [before] = await db
      .select()
      .from(users)
      .where(eq(users.role, "cashier"));
    await expect(action(db, configuredAdmin)).resolves.toBe("created");
    const [after] = await db
      .select()
      .from(users)
      .where(eq(users.role, "cashier"));
    expect(after).toEqual(before);
    expect(await admins()).toEqual([
      expect.objectContaining({
        username: configuredAdmin.username,
        role: "admin",
        branchId: null,
        isSuperAdmin: true,
      }),
    ]);
  });

  it("clears a cashier branch while repairing the flagged super-admin role", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: configuredAdmin.name,
        username: configuredAdmin.username,
        role: "cashier",
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        isSuperAdmin: true,
      }),
    );
    await expect(action(db, configuredAdmin)).resolves.toBe("updated");
    expect(await admins()).toEqual([
      expect.objectContaining({
        username: configuredAdmin.username,
        role: "admin",
        branchId: null,
        isSuperAdmin: true,
      }),
    ]);
  });

  it("still rejects a rename that would take another global admin identity", async () => {
    await db.insert(users).values(
      testBranchValues([
        {
          name: "Super",
          username: "original-super",
          role: "admin",
          passwordHash: "unused",
          isSuperAdmin: true,
        },
        {
          name: "Other",
          username: configuredAdmin.username,
          role: "admin",
          passwordHash: "unused",
        },
      ]),
    );
    await expect(action(db, configuredAdmin)).rejects.toThrow(
      "belongs to another user",
    );
    expect(await admins()).toHaveLength(2);
  });
});

describe("syncConfiguredAdmin", () => {
  it("creates the configured admin when no users exist", async () => {
    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const rows = await db.select().from(users);

    expect(result).toBe("created");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: configuredAdmin.username,
      role: "admin",
      isSuperAdmin: true,
    });
  });

  it("does nothing when the stored admin already matches", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: configuredAdmin.name,
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        tokenVersion: 7,
        role: "admin",
        isSuperAdmin: true,
      }),
    );

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe("unchanged");
    expect(row.tokenVersion).toBe(7);
    expect(
      await bcrypt.compare(configuredAdmin.password, row.passwordHash),
    ).toBe(true);
  });

  it("updates the name without revoking sessions", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: "Old name",
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        tokenVersion: 7,
        role: "admin",
        isSuperAdmin: true,
      }),
    );

    const result = await syncConfiguredAdmin(db, {
      ...configuredAdmin,
      name: "New name",
    });
    const [row] = await db.select().from(users);

    expect(result).toBe("updated");
    expect(row.name).toBe("New name");
    expect(row.tokenVersion).toBe(7);
  });

  it("updates the password and revokes sessions only when it changed", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: configuredAdmin.name,
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash("old-password", 4),
        tokenVersion: 7,
        role: "admin",
        isSuperAdmin: true,
      }),
    );

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe("updated");
    expect(row.tokenVersion).toBe(8);
    expect(
      await bcrypt.compare(configuredAdmin.password, row.passwordHash),
    ).toBe(true);
  });

  it("restores a flagged super-admin renamed and deactivated in the database", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: "Renamed directly",
        username: "renamed-in-db",
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        role: "admin",
        isActive: false,
        isSuperAdmin: true,
      }),
    );

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe("updated");
    expect(row).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      isActive: true,
      isSuperAdmin: true,
    });
  });

  it("adopts and flags the matching admin when the flag was lost", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: "Configured admin before seed",
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        role: "admin",
        isActive: false,
        isSuperAdmin: false,
      }),
    );

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe("updated");
    expect(row).toMatchObject({ isActive: true, isSuperAdmin: true });
  });

  it("renames the flagged admin even when other admins exist (regression)", async () => {
    await db.insert(users).values(
      testBranchValues([
        {
          name: "Other admin",
          username: "other-admin",
          passwordHash: await bcrypt.hash("other-password", 4),
          role: "admin",
        },
        {
          name: configuredAdmin.name,
          username: "legacy-super",
          passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
          role: "admin",
          isSuperAdmin: true,
        },
      ]),
    );

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const rows = await admins();

    expect(result).toBe("updated");
    expect(rows).toHaveLength(2);
    const flagged = rows.filter((row) => row.isSuperAdmin);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      username: configuredAdmin.username,
      name: configuredAdmin.name,
      isActive: true,
    });
  });

  it("keeps exactly one flagged super-admin across repeated syncs", async () => {
    await db.insert(users).values(
      testBranchValues({
        name: configuredAdmin.name,
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        role: "admin",
        isSuperAdmin: true,
      }),
    );

    await syncConfiguredAdmin(db, configuredAdmin);
    await syncConfiguredAdmin(db, configuredAdmin);
    const flagged = (await admins()).filter((row) => row.isSuperAdmin);

    expect(flagged).toHaveLength(1);
  });

  it("serializes concurrent syncs into a single admin without duplicates", async () => {
    const results = await Promise.all([
      syncConfiguredAdmin(db, configuredAdmin),
      syncConfiguredAdmin(db, configuredAdmin),
    ]);
    const rows = await db.select().from(users);

    expect(results).toContain("created");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: configuredAdmin.username,
      role: "admin",
      isSuperAdmin: true,
    });
  });
});
