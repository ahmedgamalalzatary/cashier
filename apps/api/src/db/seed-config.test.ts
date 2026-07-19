import { describe, expect, it } from 'vitest';
import { getAdminSeedConfig } from './seed-config.js';

describe('admin seed configuration', () => {
  it('reads the initial admin credentials from environment values', () => {
    expect(
      getAdminSeedConfig({
        ADMIN_NAME: 'مدير الفرع',
        ADMIN_USERNAME: 'branch-admin',
        ADMIN_PASSWORD: 'strong-password-123',
      }),
    ).toEqual({ name: 'مدير الفرع', username: 'branch-admin', password: 'strong-password-123' });
  });

  it('requires a username and a non-empty password', () => {
    expect(() => getAdminSeedConfig({ ADMIN_PASSWORD: 'strong-password-123' })).toThrow('ADMIN_USERNAME');
    expect(() => getAdminSeedConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: '' })).toThrow('ADMIN_PASSWORD');
  });
});
