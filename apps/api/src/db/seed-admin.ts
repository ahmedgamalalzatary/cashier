import bcrypt from 'bcryptjs';
import { count, eq, sql } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from './index.js';
import { users } from './schema.js';

export type AdminSeedConfig = {
  name: string;
  username: string;
  password: string;
};

type SeedHandle = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const ADMIN_SEED_LOCK = 'cashier:admin-seed';
const ADMIN_SEED_LOCK_TIMEOUT_S = 10;

export async function seedAdmin(db: SeedHandle, admin: AdminSeedConfig) {
  const passwordHash = await bcrypt.hash(admin.password, 10);
  const existingAdmin = await findManagedAdmin(db, admin.username);

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

async function findManagedAdmin(db: SeedHandle, username: string) {
  const [usernameOwner] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (usernameOwner && usernameOwner.role !== 'admin') {
    throw new Error(
      `Cannot seed admin: username "${username}" belongs to another user`,
    );
  }

  if (usernameOwner) return usernameOwner;
  const existingAdmins = await db
    .select()
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(users.id)
    .limit(2);
  if (existingAdmins.length > 1) {
    throw new Error(
      'Cannot seed admin: multiple admin accounts exist and none matches the configured username',
    );
  }
  return existingAdmins[0] ?? null;
}

// Boot-time sync for API startup: creates the configured admin on an empty
// database, updates name/username/password when the environment values
// differ, and otherwise stays silent. Sessions are revoked (tokenVersion
// bump) only when the password actually changed, so restarts with unchanged
// config never log anyone out. Operational state (isActive) is left alone;
// use the manual db:seed script for resets and reactivation.
export async function syncConfiguredAdmin(db: Db, admin: AdminSeedConfig) {
  // Boot-time sync runs in every API process, so concurrent boots must
  // serialize the whole check-then-create flow. A MySQL named lock gates
  // entry (one holder across all processes) and a transaction keeps the
  // reads and writes atomic on that holder's path.
  const connection = await db.$client.getConnection();
  const [lockRows] = await connection.query<
    Array<RowDataPacket & { acquired: number }>
  >(`SELECT GET_LOCK(?, ${ADMIN_SEED_LOCK_TIMEOUT_S}) AS acquired`, [
    ADMIN_SEED_LOCK,
  ]);
  if (lockRows[0]?.acquired !== 1) {
    connection.release();
    throw new Error(
      'Cannot sync admin: timed out waiting for the admin seed lock',
    );
  }
  try {
    return await db.transaction((tx) => runSync(tx, admin));
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)', [ADMIN_SEED_LOCK]);
    connection.release();
  }
}

async function runSync(tx: SeedHandle, admin: AdminSeedConfig) {
  const [{ total }] = await tx.select({ total: count() }).from(users);
  if (total === 0) {
    await seedAdmin(tx, admin);
    return 'created' as const;
  }

  const existing = await findManagedAdmin(tx, admin.username);
  if (!existing) {
    await seedAdmin(tx, admin);
    return 'created' as const;
  }

  const passwordChanged = !(await bcrypt.compare(
    admin.password,
    existing.passwordHash,
  ));
  if (
    !passwordChanged &&
    existing.name === admin.name &&
    existing.username === admin.username
  ) {
    return 'unchanged' as const;
  }

  await tx
    .update(users)
    .set({
      name: admin.name,
      username: admin.username,
      ...(passwordChanged
        ? {
            passwordHash: await bcrypt.hash(admin.password, 10),
            tokenVersion: sql`${users.tokenVersion} + 1`,
          }
        : {}),
    })
    .where(eq(users.id, existing.id));
  return 'updated' as const;
}
