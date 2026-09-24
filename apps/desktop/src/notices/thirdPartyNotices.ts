import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Plugin } from 'vite';

/**
 * Third-party notices for what the app ships (slice 8.6b).
 *
 * Everything the app runs is bundled by Vite into `out/` — nothing in
 * node_modules ships — so the list of third-party code in a release is the list
 * of packages whose modules made it into a bundle. This reads that list from
 * the bundles themselves, at build time, rather than keeping one by hand: a
 * dependency added, removed or tree-shaken away changes the notices with it.
 *
 * Each build collects; the renderer's, the last, writes `THIRD_PARTY_NOTICES.txt`
 * beside its `index.html`. The app shows it from Help › Third-Party Notices, and
 * the packager copies it into the release beside `app.asar`.
 */

export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

/** One package, or one vendored asset, and the licence it comes under. */
export interface Notice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly homepage?: string;
  /** What it is for, when that is not obvious from its name. */
  readonly note?: string;
  readonly text: string;
}

/**
 * The package a bundled module belongs to, as a directory: the path up to and
 * including its name after the last `node_modules`. `null` for the app's own
 * code and the workspace packages, and for Rollup's virtual modules.
 */
export function packageRootOf(moduleId: string): string | null {
  if (moduleId.startsWith('\0')) return null;
  const path = moduleId.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;

  const rest = path.slice(at + '/node_modules/'.length).split('/');
  const name = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1);
  if (name.length === 0 || name.some((part) => part === '' || part === '.pnpm')) return null;
  return `${path.slice(0, at)}/node_modules/${name.join('/')}`;
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** A package's notice, from its own package.json and licence files. */
export function noticeFor(root: string): Notice {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string | { type?: string };
    homepage?: string;
  };
  const license =
    typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? '');
  const files = readdirSync(root)
    .filter((file) => LICENCE_FILE.test(file))
    .sort();

  // Shipping someone's code without their licence text is the one thing this
  // exists to prevent, so a package without one stops the build.
  if (files.length === 0 || license === '') {
    throw new Error(
      `third-party notices: ${manifest.name}@${manifest.version} has no licence ` +
        `${license === '' ? 'field' : 'file'} in ${root}. Record its terms by hand ` +
        `in \`vendored\` before it can ship.`,
    );
  }

  return {
    name: manifest.name,
    version: manifest.version,
    license,
    ...(manifest.homepage === undefined ? {} : { homepage: manifest.homepage }),
    text: files.map((file) => readFileSync(join(root, file), 'utf8').trim()).join('\n\n'),
  };
}

/** The notices file: every notice once, by name, the same bytes for the same inputs. */
export function renderNotices(notices: readonly Notice[]): string {
  const rule = '='.repeat(78);
  const thin = '-'.repeat(78);
  const unique = [
    ...new Map(notices.map((notice) => [`${notice.name}@${notice.version}`, notice])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));

  const header = [
    'LeatherCAD — third-party notices',
    '',
    'LeatherCAD is licensed under the Apache License, Version 2.0. It includes the',
    'third-party software and assets below, each under its own licence.',
    '',
    'Electron and Chromium, which run LeatherCAD, ship their own notices beside the',
    'application: LICENSE.electron.txt and LICENSES.chromium.html.',
    '',
    ...unique.map((notice) => `  ${notice.name} ${notice.version} — ${notice.license}`),
  ];

  const sections = unique.map((notice) =>
    [
      rule,
      `${notice.name} ${notice.version} — ${notice.license}`,
      ...(notice.homepage === undefined ? [] : [notice.homepage]),
      ...(notice.note === undefined ? [] : [notice.note]),
      thin,
      notice.text,
    ].join('\n'),
  );

  return `${[header.join('\n'), ...sections].join('\n\n')}\n`;
}

/**
 * The plugins. `collect(name)` goes in every build; `write()` in the
 * renderer's, after its `collect`. `vendored` is what reaches a bundle without
 * coming from node_modules — the typeface, copied into the repository.
 */
export function thirdPartyNotices(options: { readonly vendored: readonly Notice[] }): {
  collect: (build: string) => Plugin;
  write: (requires: readonly string[]) => Plugin;
} {
  const roots = new Set<string>();
  const collected = new Set<string>();

  return {
    collect: (build) => ({
      name: `leathercad:third-party-notices:collect:${build}`,
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          for (const [id, module] of Object.entries(output.modules)) {
            // Only what survived tree-shaking is shipped.
            if (module.renderedLength === 0) continue;
            const root = packageRootOf(id);
            if (root !== null) roots.add(root);
          }
        }
        collected.add(build);
      },
    }),

    write: (requires) => ({
      name: 'leathercad:third-party-notices:write',
      apply: 'build',
      generateBundle() {
        const missing = requires.filter((build) => !collected.has(build));
        if (missing.length > 0) {
          throw new Error(
            `third-party notices: the ${missing.join(' and ')} bundle was not collected ` +
              `before the renderer's, so its packages would be missing from the notices.`,
          );
        }
        const notices = [...[...roots].filter((root) => existsSync(root)).map(noticeFor)];
        this.emitFile({
          type: 'asset',
          fileName: NOTICES_FILE,
          source: renderNotices([...notices, ...options.vendored]),
        });
      },
    }),
  };
}
