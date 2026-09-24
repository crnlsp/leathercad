import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  noticeFor,
  packageRootOf,
  renderNotices,
  thirdPartyNotices,
  type Notice,
} from './thirdPartyNotices.js';

/**
 * Third-party notices (8.6b): what the bundles ship, and the licence of each.
 */

describe('which package a bundled module belongs to', () => {
  it('reads a pnpm store path by its last node_modules', () => {
    expect(
      packageRootOf('/repo/node_modules/.pnpm/react@19.2.8/node_modules/react/cjs/react.js'),
    ).toBe('/repo/node_modules/.pnpm/react@19.2.8/node_modules/react');
  });

  it('keeps a scope with its name', () => {
    expect(packageRootOf('/r/node_modules/.pnpm/x/node_modules/@pdf-lib/upng/cjs/index.js')).toBe(
      '/r/node_modules/.pnpm/x/node_modules/@pdf-lib/upng',
    );
  });

  it('reads a Windows path, and drops a query', () => {
    expect(packageRootOf('C:\\r\\node_modules\\zod\\index.js?commonjs-exports')).toBe(
      'C:/r/node_modules/zod',
    );
  });

  it('owns nothing for the app’s own code, the workspace or a virtual module', () => {
    expect(packageRootOf('/repo/apps/desktop/src/renderer/src/App.tsx')).toBeNull();
    expect(packageRootOf('/repo/packages/geometry/src/index.ts')).toBeNull();
    expect(packageRootOf('\0commonjsHelpers.js')).toBeNull();
  });
});

describe('a package’s notice', () => {
  it('carries its name, version, licence and the licence text it ships', () => {
    // A real one, as installed: the notice is read from the package itself.
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('react/package.json'));
    const notice = noticeFor(root);
    expect(notice.name).toBe('react');
    expect(notice.license).toBe('MIT');
    expect(notice.text).toMatch(/Permission is hereby granted/);
  });

  it('stops the build for a package with no licence file', () => {
    const root = mkdtempSync(join(tmpdir(), 'leathercad-notice-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'quiet', version: '1.0.0', license: 'MIT' }),
      );
      expect(() => noticeFor(root)).toThrow(/quiet@1\.0\.0 has no licence file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the notices file', () => {
  const notice = (name: string, version = '1.0.0'): Notice => ({
    name,
    version,
    license: 'MIT',
    text: `${name} licence text`,
  });

  it('lists each package once, by name, and is the same for the same inputs', () => {
    const text = renderNotices([notice('zod'), notice('react'), notice('zod')]);
    expect(text.match(/^zod 1\.0\.0 — MIT$/gm)).toHaveLength(1);
    expect(text.indexOf('react 1.0.0 — MIT')).toBeLessThan(text.indexOf('zod 1.0.0 — MIT'));
    expect(renderNotices([notice('react'), notice('zod')])).toBe(text);
  });

  it('points at the notices Electron and Chromium ship themselves', () => {
    expect(renderNotices([])).toMatch(/LICENSE\.electron\.txt and LICENSES\.chromium\.html/);
  });
});

describe('the build plugins', () => {
  it('refuse to write before the other bundles are collected', () => {
    // electron-vite builds main, then preload, then the renderer. If that ever
    // changed, the notices would silently lose main's packages; this fails
    // the build instead.
    const { write } = thirdPartyNotices({ vendored: [] });
    const plugin = write(['main']);
    const generate = plugin.generateBundle as unknown as (this: unknown) => void;
    expect(() => generate.call({ emitFile: () => '' })).toThrow(/main bundle was not collected/);
  });
});
