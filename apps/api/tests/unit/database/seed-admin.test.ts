import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../../support/setup.js';
import { users } from '../../../src/db/schema.js';
import { seedAdmin } from '../../../src/db/seed-admin.js';

const configuredAdmin = {
  name: 'مدير الفرع',
  username: 'configured-admin',
  password: 'configured-password',
};

describe('seedAdmin', () => {
  it('creates the configured admin when no admin exists', async () => {
    const result = await seedAdmin(db, configuredAdmin);
    const [user] = await db.select().from(users).where(eq(users.role, 'admin'));

    expect(result).toBe('created');
    expect(user).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      role: 'admin',
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
    const rows = await db.select().from(users).where(eq(users.role, 'admin'));

    expect(result).toBe('updated');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: configuredAdmin.name,
      username: configuredAdmin.username,
      isActive: true,
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
});
