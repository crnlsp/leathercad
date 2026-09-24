import { describe, expect, it } from 'vitest';

import { mayOpenExternally } from './externalLinks.js';

describe('mayOpenExternally', () => {
  it.each([
    'https://github.com/crnlsp/leathercad',
    'https://example.com/a/b?c=d#e',
    'HTTPS://EXAMPLE.COM/',
  ])('lets %s through to the browser', (url) => {
    expect(mayOpenExternally(url)).toBe(true);
  });

  it.each([
    // Not encrypted.
    'http://example.com/',
    // A local file, a share, a script, another program.
    'file:///etc/passwd',
    'smb://server/share',
    'javascript:alert(1)',
    'vscode://file/etc/passwd',
    'ms-settings:',
    // Not a URL at all.
    '',
    'example.com',
    '//example.com/',
    'https:',
  ])('refuses %s', (url) => {
    expect(mayOpenExternally(url)).toBe(false);
  });
});
