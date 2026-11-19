import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RELEASE = resolve(import.meta.dirname, '../apps/desktop/release');

/**
 * Where `pnpm package:dir` leaves the app on this platform (8.6a): a loose
 * executable on Linux and Windows, one inside the .app bundle on macOS — whose
 * directory is named for the architecture it was built on. The packaged smoke
 * test drives it, and so do `tools/perf-startup.mjs` and `tools/perf-soak.mjs`.
 */
export function packagedExecutable(): string {
  switch (process.platform) {
    case 'win32':
      return join(RELEASE, 'win-unpacked', 'leathercad.exe');
    case 'darwin': {
      const built = ['mac-universal', 'mac-arm64', 'mac']
        .map((dir) => join(RELEASE, dir, 'LeatherCAD.app', 'Contents', 'MacOS'))
        .find((dir) => existsSync(dir));
      const binary = built === undefined ? undefined : readdirSync(built)[0];
      return built === undefined || binary === undefined
        ? join(RELEASE, 'mac-*', 'LeatherCAD.app')
        : join(built, binary);
    }
    default:
      return join(RELEASE, 'linux-unpacked', 'leathercad');
  }
}
