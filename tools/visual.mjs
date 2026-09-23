#!/usr/bin/env node
/**
 * `pnpm test:visual` — pixel diffs inside the pinned Playwright container.
 *
 * The image tag comes from the installed @playwright/test, so the browser
 * dependencies, fonts and Xvfb are the same wherever this runs. The repository
 * is mounted at its own path, so pnpm's relative links resolve unchanged, and
 * the container runs as the calling user, so updated references are not owned
 * by root.
 *
 * Build first (`pnpm build`); the container only runs Playwright against
 * `apps/desktop/out`. Extra arguments go to Playwright:
 *
 *   pnpm test:visual --update-snapshots
 *
 * Inside the container (LEATHERCAD_IN_CONTAINER=1) it runs Playwright directly.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: root });
  if (result.error !== undefined) {
    console.error(`test:visual: could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.env['LEATHERCAD_IN_CONTAINER'] === '1') {
  run('node_modules/.bin/playwright', ['test', '--config', 'playwright.visual.config.ts', ...args]);
}

const { version } = JSON.parse(
  readFileSync(resolve(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
);
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;

run('docker', [
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  `--user=${uid}:${gid}`,
  `--volume=${root}:${root}`,
  `--workdir=${root}`,
  '--env=HOME=/tmp',
  '--env=LEATHERCAD_IN_CONTAINER=1',
  ...(process.env['CI'] === undefined ? [] : ['--env=CI=1']),
  image,
  // A 24-bit screen: xvfb-run's default depth is 8, which bands every colour.
  'xvfb-run',
  '--auto-servernum',
  '--server-args=-screen 0 1920x1080x24',
  'node',
  'tools/visual.mjs',
  ...args,
]);
