import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './index.js';
import { users } from './schema.js';

type AdminSeedConfig = {
  name: string;
  username: string;
  password: string;
};

export async function seedAdmin(db: Db, admin: AdminSeedConfig) {
  const passwordHash = await bcrypt.hash(admin.password, 10);
  const [usernameOwner] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.username, admin.username))
    .limit(1);

  if (usernameOwner && usernameOwner.role !== 'admin') {
    throw new Error(
      `Cannot seed admin: username "${admin.username}" belongs to another user`,
    );
  }

  const existingAdmins = usernameOwner
    ? [usernameOwner]
    : await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(users.id)
        .limit(2);
  if (!usernameOwner && existingAdmins.length > 1) {
    throw new Error(
      'Cannot seed admin: multiple admin accounts exist and none matches the configured username',
    );
  }
  const [existingAdmin] = existingAdmins;

  if (existingAdmin) {
    await db
      .update(users)
      .set({
        name: admin.name,
        username: admin.username,
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        isActive: true,
      })
      .where(eq(users.id, existingAdmin.id));
    return 'updated' as const;
  }

  await db.insert(users).values({
    name: admin.name,
    username: admin.username,
    passwordHash,
    role: 'admin',
  });
  return 'created' as const;
}
