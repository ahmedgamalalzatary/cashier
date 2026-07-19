import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('API runtime image', () => {
  it('copies the complete shared runtime package from the build stage', async () => {
    const dockerfile = await readFile(
      new URL('../../../dockerfile.api', import.meta.url),
      'utf8',
    );

    expect(dockerfile).toContain(
      'COPY --from=build /app/packages/shared ./packages/shared',
    );
  });
});
