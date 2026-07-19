import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { users } from '../../src/db/schema.js';
import { db } from './setup.js';

export async function createUser(role: 'admin' | 'cashier', username = role) {
  await db.insert(users).values({
    name: role === 'admin' ? 'مدير' : 'كاشير',
    username,
    passwordHash: bcrypt.hashSync('secret123', 4),
    role,
  });
  return { username, password: 'secret123' };
}

export async function loginAs(app: Express, role: 'admin' | 'cashier') {
  const creds = await createUser(role);
  const res = await request(app).post('/api/auth/login').send(creds);
  return { Authorization: `Bearer ${res.body.token}` } as const;
}
