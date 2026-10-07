import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../support/database.js';
import { users } from '../../src/schema.js';
import {
  seedAdmin,
  syncConfiguredAdmin,
} from '../../src/seed-admin.js';

const configuredAdmin = {
  name: 'مدير الفرع',
  username: 'configured-admin',
  password: 'configured-password',
};

async function admins() {
  return db.select().from(users).where(eq(users.role, 'admin'));
}

describe('seedAdmin', () => {
  it('creates the configured admin when no admin exists', async () => {
    const result = await seedAdmin(db, configuredAdmin);
    const [user] = await admins();

    expect(result).toBe('created');
    expect(user).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      role: 'admin',
      isSuperAdmin: true,
    });
    expect(
      await bcrypt.compare(configuredAdmin.password, user.passwordHash),
    ).toBe(true);
  });

  it('updates the existing admin from the configured environment values', async () => {
    await db.insert(users).values({
      name: 'Old admin',
      username: 'old-admin',
      passwordHash: await bcrypt.hash('old-password', 4),
      tokenVersion: 3,
      role: 'admin',
      isActive: false,
    });

    const result = await seedAdmin(db, configuredAdmin);
    const rows = await admins();

    expect(result).toBe('updated');
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

  it('reports a clear error when another user owns the configured username', async () => {
    await db.insert(users).values([
      {
        name: 'Existing admin',
        username: 'old-admin',
        passwordHash: await bcrypt.hash('old-password', 4),
        role: 'admin',
      },
      {
        name: 'Conflicting cashier',
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash('cashier-password', 4),
        role: 'cashier',
      },
    ]);

    await expect(seedAdmin(db, configuredAdmin)).rejects.toThrow(
      `Cannot seed admin: username "${configuredAdmin.username}" belongs to another user`,
    );
  });

  it('updates the admin matching the configured username when several admins exist', async () => {
    await db.insert(users).values([
      {
        name: 'First admin',
        username: 'first-admin',
        passwordHash: await bcrypt.hash('first-password', 4),
        role: 'admin',
      },
      {
        name: 'Configured admin before seed',
        username: configuredAdmin.username,
        passwordHash: await bcrypt.hash('old-password', 4),
        role: 'admin',
      },
    ]);

    await expect(seedAdmin(db, configuredAdmin)).resolves.toBe('updated');
    const rows = await admins();
    expect(rows.find((row) => row.username === 'first-admin')).toMatchObject({
      name: 'First admin',
      isSuperAdmin: false,
    });
    expect(
      rows.find((row) => row.username === configuredAdmin.username),
    ).toMatchObject({ name: configuredAdmin.name, isSuperAdmin: true });
  });

  it('creates a flagged super-admin when no admin matches the configured username', async () => {
    await db.insert(users).values([
      {
        name: 'First admin',
        username: 'first-admin',
        passwordHash: await bcrypt.hash('first-password', 4),
        role: 'admin',
      },
      {
        name: 'Second admin',
        username: 'second-admin',
        passwordHash: await bcrypt.hash('second-password', 4),
        role: 'admin',
      },
    ]);

    await expect(seedAdmin(db, configuredAdmin)).resolves.toBe('created');
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

describe('syncConfiguredAdmin', () => {
  it('creates the configured admin when no users exist', async () => {
    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const rows = await db.select().from(users);

    expect(result).toBe('created');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: configuredAdmin.username,
      role: 'admin',
      isSuperAdmin: true,
    });
  });

  it('does nothing when the stored admin already matches', async () => {
    await db.insert(users).values({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
      tokenVersion: 7,
      role: 'admin',
      isSuperAdmin: true,
    });

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe('unchanged');
    expect(row.tokenVersion).toBe(7);
    expect(
      await bcrypt.compare(configuredAdmin.password, row.passwordHash),
    ).toBe(true);
  });

  it('updates the name without revoking sessions', async () => {
    await db.insert(users).values({
      name: 'Old name',
      username: configuredAdmin.username,
      passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
      tokenVersion: 7,
      role: 'admin',
      isSuperAdmin: true,
    });

    const result = await syncConfiguredAdmin(db, {
      ...configuredAdmin,
      name: 'New name',
    });
    const [row] = await db.select().from(users);

    expect(result).toBe('updated');
    expect(row.name).toBe('New name');
    expect(row.tokenVersion).toBe(7);
  });

  it('updates the password and revokes sessions only when it changed', async () => {
    await db.insert(users).values({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      passwordHash: await bcrypt.hash('old-password', 4),
      tokenVersion: 7,
      role: 'admin',
      isSuperAdmin: true,
    });

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe('updated');
    expect(row.tokenVersion).toBe(8);
    expect(await bcrypt.compare(configuredAdmin.password, row.passwordHash)).toBe(
      true,
    );
  });

  it('restores a flagged super-admin renamed and deactivated in the database', async () => {
    await db.insert(users).values({
      name: 'Renamed directly',
      username: 'renamed-in-db',
      passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
      role: 'admin',
      isActive: false,
      isSuperAdmin: true,
    });

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe('updated');
    expect(row).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      isActive: true,
      isSuperAdmin: true,
    });
  });

  it('adopts and flags the matching admin when the flag was lost', async () => {
    await db.insert(users).values({
      name: 'Configured admin before seed',
      username: configuredAdmin.username,
      passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
      role: 'admin',
      isActive: false,
      isSuperAdmin: false,
    });

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const [row] = await db.select().from(users);

    expect(result).toBe('updated');
    expect(row).toMatchObject({ isActive: true, isSuperAdmin: true });
  });

  it('renames the flagged admin even when other admins exist (regression)', async () => {
    await db.insert(users).values([
      {
        name: 'Other admin',
        username: 'other-admin',
        passwordHash: await bcrypt.hash('other-password', 4),
        role: 'admin',
      },
      {
        name: configuredAdmin.name,
        username: 'legacy-super',
        passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
        role: 'admin',
        isSuperAdmin: true,
      },
    ]);

    const result = await syncConfiguredAdmin(db, configuredAdmin);
    const rows = await admins();

    expect(result).toBe('updated');
    expect(rows).toHaveLength(2);
    const flagged = rows.filter((row) => row.isSuperAdmin);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      username: configuredAdmin.username,
      name: configuredAdmin.name,
      isActive: true,
    });
  });

  it('keeps exactly one flagged super-admin across repeated syncs', async () => {
    await db.insert(users).values({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      passwordHash: await bcrypt.hash(configuredAdmin.password, 4),
      role: 'admin',
      isSuperAdmin: true,
    });

    await syncConfiguredAdmin(db, configuredAdmin);
    await syncConfiguredAdmin(db, configuredAdmin);
    const flagged = (await admins()).filter((row) => row.isSuperAdmin);

    expect(flagged).toHaveLength(1);
  });

  it('serializes concurrent syncs into a single admin without duplicates', async () => {
    const results = await Promise.all([
      syncConfiguredAdmin(db, configuredAdmin),
      syncConfiguredAdmin(db, configuredAdmin),
    ]);
    const rows = await db.select().from(users);

    expect(results).toContain('created');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: configuredAdmin.username,
      role: 'admin',
      isSuperAdmin: true,
    });
  });
});
