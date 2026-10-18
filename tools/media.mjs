#!/usr/bin/env node
/**
 * `pnpm docs:media` — the README's pictures, taken inside the pinned
 * Playwright container, as `pnpm test:visual` takes the pixel references.
 *
 * Two reasons (Q27). On the Linux desktop it was found on, a Wayland session,
 * Electron never loaded a window that Playwright recorded video of — a bare
 * BrowserWindow included, on X11 or Wayland, GPU or not — while under the
 * container's Xvfb it does. And the pictures want
 * the container's screen and fonts, the same on every machine.
 *
 * The container starts as root only to install what the spec runs besides
 * Playwright — poppler, ffmpeg, gifsicle and pngquant — then runs Playwright
 * as the calling user, so the pictures are not owned by root. Build first
 * (`pnpm docs:media` does). Extra arguments go to Playwright.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(
  readFileSync(resolve(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
);
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;
const playwright = [
  'node_modules/.bin/playwright',
  'test',
  '--config',
  'playwright.media.config.ts',
]
  .concat(process.argv.slice(2))
  .map((arg) => `'${arg.replaceAll("'", "'\\''")}'`)
  .join(' ');

const script = [
  'apt-get update -qq',
  'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg gifsicle pngquant poppler-utils >/dev/null',
  // A 24-bit screen: xvfb-run's default depth is 8, which bands every colour.
  `exec setpriv --reuid=${uid} --regid=${gid} --clear-groups env HOME=/tmp xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' ${playwright}`,
].join(' && ');

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    `--volume=${root}:${root}`,
    `--workdir=${root}`,
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'bash',
    '-c',
    script,
  ],
  { stdio: 'inherit', cwd: root },
);
if (result.error !== undefined) {
  console.error(`docs:media: could not run docker: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
