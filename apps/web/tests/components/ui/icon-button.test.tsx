import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton } from "../../../src/components/ui/icon-button";

describe('users icon actions', () => {
  it('uses the action title as the accessible button name', () => {
    const markup = renderToStaticMarkup(
      <IconButton title="Edit user" onClick={() => undefined}>
        icon
      </IconButton>,
    );

    expect(markup).toContain('title="Edit user"');
    expect(markup).toContain('aria-label="Edit user"');
  });
});
