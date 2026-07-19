import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = path.resolve(import.meta.dirname, '../../..');

async function findTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTests(entryPath);
      return entry.name.endsWith('.test.ts') ? [entryPath] : [];
    }),
  );

  return nested.flat();
}

describe('API test organization', () => {
  it('keeps test files out of the production source tree', async () => {
    await expect(findTests(path.join(apiRoot, 'src'))).resolves.toEqual([]);
  });

  it('keeps test files inside categorized test directories', async () => {
    const testsRoot = path.join(apiRoot, 'tests');
    const testFiles = await findTests(testsRoot);
    const misplaced = testFiles
      .map((file) => path.relative(testsRoot, file))
      .filter(
        (file) =>
          !file.startsWith(`unit${path.sep}`) &&
          !file.startsWith(`integration${path.sep}`),
      );

    expect(misplaced).toEqual([]);
  });
});
