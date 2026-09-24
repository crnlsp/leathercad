import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEV_SERVER_SOURCES, allowDevServer, devServerCsp } from './devServerCsp.js';

/**
 * The renderer's Content-Security-Policy. The shipped page connects to
 * nothing but itself; the development page may also reach the Vite dev
 * server. Architecture §5.
 */

const INDEX_HTML = resolve(import.meta.dirname, '../renderer/index.html');

/** The policy in a page, as directive → sources. */
function policy(html: string): Map<string, string[]> {
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  if (match === null) throw new Error('no Content-Security-Policy meta tag');
  return new Map(
    match[1]!.split(';').map((directive) => {
      const [name = '', ...sources] = directive.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );
}

describe('the shipped Content-Security-Policy', () => {
  const shipped = policy(readFileSync(INDEX_HTML, 'utf8'));

  it('connects to nothing but the app itself', () => {
    expect(shipped.get('connect-src')).toEqual(["'self'"]);
  });

  it('loads scripts only from the app, and nothing that is not a script', () => {
    expect(shipped.get('default-src')).toEqual(["'self'"]);
    expect(shipped.get('script-src')).toEqual(["'self'"]);
    expect(shipped.get('object-src')).toEqual(["'none'"]);
    expect(shipped.get('base-uri')).toEqual(["'none'"]);
  });

  it('names no socket and no localhost anywhere', () => {
    for (const sources of shipped.values()) {
      for (const source of sources) {
        expect(source).not.toMatch(/^wss?:|localhost/);
      }
    }
  });
});

describe('the development Content-Security-Policy', () => {
  it('adds the dev server to connect-src, and changes nothing else', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const shipped = policy(html);
    const dev = policy(allowDevServer(html));

    expect(dev.get('connect-src')).toEqual(["'self'", ...DEV_SERVER_SOURCES.split(' ')]);
    dev.delete('connect-src');
    shipped.delete('connect-src');
    expect(dev).toEqual(shipped);
  });

  it('refuses a page it cannot extend, rather than serving it unchanged', () => {
    expect(() => allowDevServer('<html></html>')).toThrow(/exactly one/);
    expect(() => allowDevServer("connect-src 'self'; x; connect-src 'self'")).toThrow(/found 2/);
  });

  it('is a plugin for the dev server only, never for a build', () => {
    expect(devServerCsp().apply).toBe('serve');
  });
});
