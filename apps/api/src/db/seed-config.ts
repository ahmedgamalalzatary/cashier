type SeedEnvironment = Record<string, string | undefined>;

export function getAdminSeedConfig(env: SeedEnvironment) {
  const name = env.ADMIN_NAME?.trim() || 'المدير';
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;

  if (!username) throw new Error('ADMIN_USERNAME is required in the root .env file');
  if (!password) throw new Error('ADMIN_PASSWORD is required in the root .env file');

  return { name, username, password };
}
