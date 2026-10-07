import bcrypt from 'bcryptjs';
import { count, eq, sql } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from './client.js';
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
  const existingAdmin = await findSuperAdmin(db, admin.username);

  if (existingAdmin) {
    await db
      .update(users)
      .set({
        name: admin.name,
        username: admin.username,
        passwordHash,
        role: 'admin',
        isActive: true,
        isSuperAdmin: true,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, existingAdmin.id));
    return 'updated' as const;
  }

  await db.insert(users).values({
    name: admin.name,
    username: admin.username,
    passwordHash,
    role: 'admin',
    isSuperAdmin: true,
  });
  return 'created' as const;
}

// The configured super-admin is resolved without ever guessing between several
// candidates: a flagged row wins, then the configured username, then a lone
// admin. Anything more ambiguous creates a fresh flagged account instead of
// failing the boot.
async function findSuperAdmin(db: SeedHandle, username: string) {
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

  const [flagged] = await db
    .select()
    .from(users)
    .where(eq(users.isSuperAdmin, true))
    .orderBy(users.id)
    .limit(1);

  if (flagged) {
    if (usernameOwner && usernameOwner.id !== flagged.id) {
      throw new Error(
        `Cannot seed admin: username "${username}" belongs to another user`,
      );
    }
    return flagged;
  }

  if (usernameOwner) return usernameOwner;

  const existingAdmins = await db
    .select()
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(users.id)
    .limit(2);
  return existingAdmins.length === 1 ? existingAdmins[0] : null;
}

// Boot-time sync for API startup: creates the configured admin on an empty
// database, updates name/username/password when the environment values
// differ, and otherwise stays silent. Sessions are revoked (tokenVersion
// bump) only when the password actually changed, so restarts with unchanged
// config never log anyone out. The super-admin flag, admin role, and active
// state are always enforced, so a renamed or deactivated account recovers on
// the next boot. Use the manual db:seed script for a full reset.
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

  const existing = await findSuperAdmin(tx, admin.username);
  if (!existing) {
    await seedAdmin(tx, admin);
    return 'created' as const;
  }

  const passwordChanged = !(await bcrypt.compare(
    admin.password,
    existing.passwordHash,
  ));
  const needsForce =
    existing.role !== 'admin' ||
    !existing.isActive ||
    !existing.isSuperAdmin;
  if (
    !passwordChanged &&
    !needsForce &&
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
      role: 'admin',
      isActive: true,
      isSuperAdmin: true,
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
