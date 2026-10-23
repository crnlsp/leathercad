#!/usr/bin/env node
/**
 * `pnpm package:win` — the Windows NSIS installer, built on Linux or macOS in
 * electron-builder's pinned Wine container (ADR 0014).
 *
 * The renderer and main bundles are built here, on the host: they are the same
 * on every platform. The container runs only electron-builder, which needs
 * Wine to write the .exe's icon, version information and the app.asar
 * integrity hash — without the hash, the installed app would not start. The
 * repository is mounted at its own path, so pnpm's links resolve unchanged,
 * and the container runs as the calling user, so the installer is not owned
 * by root. Electron, the NSIS tools and the Wine prefix are kept in the
 * host's cache between runs.
 *
 * The installer lands in apps/desktop/release/, as `pnpm package` on Windows
 * puts it. Releases are still built by .github/workflows/release.yml on
 * Windows, which also runs the packaged smoke test; this is for trying a
 * change on a Windows machine without building there. Extra arguments go to
 * electron-builder:
 *
 *   pnpm package:win --dir
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// electron-builder's image with Wine and Node 22, the major in .node-version.
// Pinned by digest: a tag can be moved.
const IMAGE =
  'electronuserland/builder:22-wine-10.26@sha256:7e725c402e1a950b901263107da1c63afae9a2db02d5eed97102bd68f0decb59';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: root });
  if (result.error !== undefined) {
    console.error(`package:win: could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === 'win32') {
  console.error('package:win: on Windows, `pnpm package` builds the installer directly.');
  process.exit(1);
}

// Made here, before Docker would make them owned by root.
const cache = process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache');
const caches = {
  ELECTRON_CACHE: join(cache, 'electron'),
  ELECTRON_BUILDER_CACHE: join(cache, 'electron-builder'),
  WINEPREFIX: join(cache, 'leathercad-wine'),
};
for (const dir of Object.values(caches)) mkdirSync(dir, { recursive: true });

run('pnpm', ['build']);

const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;
run('docker', [
  'run',
  '--rm',
  '--init',
  `--user=${uid}:${gid}`,
  `--volume=${root}:${root}`,
  ...Object.values(caches).map((dir) => `--volume=${dir}:${dir}`),
  `--workdir=${join(root, 'apps/desktop')}`,
  '--env=HOME=/tmp',
  '--env=WINEDEBUG=-all',
  ...Object.entries(caches).map(([name, dir]) => `--env=${name}=${dir}`),
  IMAGE,
  'node_modules/.bin/electron-builder',
  '--config',
  'electron-builder.config.mjs',
  '--win',
  'nsis',
  '--x64',
  ...args,
]);
