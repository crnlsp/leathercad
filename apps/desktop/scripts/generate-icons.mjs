// @ts-check
/**
 * Renders every app icon from `build/icon.svg` (slice 8.5a).
 *
 * Run with `pnpm icons:generate` after changing the SVG. The output is
 * committed, as the glyph outlines are (`pnpm fonts:generate`), so packaging
 * needs no image tools — only this script does, at development time:
 *
 * - `rsvg-convert` (librsvg) draws the SVG at each size;
 * - `magick` (ImageMagick) packs the Windows `.ico`.
 *
 * The macOS `.icns` is written here: a modern `.icns` is a four-byte type, a
 * length and a PNG per size, and needs no tool at all.
 *
 * Writes, beside the SVG in `build/`:
 * - `icon.png`, 1024 px: the window icon on Linux;
 * - `icons/<n>x<n>.png`, 16–512 px: the AppImage's icon set, so a launcher or
 *   menu gets a size drawn for it rather than a 1024 px image scaled down;
 * - `icon.ico`, 16–256 px, for Windows;
 * - `icon.icns`, 16–1024 px, for macOS.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const svg = join(build, 'icon.svg');
const scratch = mkdtempSync(join(tmpdir(), 'leathercad-icons-'));

/** @param {number} size */
function render(size) {
  const out = join(scratch, `${size}.png`);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', out]);
  return out;
}

try {
  execFileSync('rsvg-convert', ['-w', '1024', '-h', '1024', svg, '-o', join(build, 'icon.png')]);

  mkdirSync(join(build, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    copyFileSync(render(size), join(build, 'icons', `${size}x${size}.png`));
  }

  const ico = [16, 24, 32, 48, 64, 128, 256].map(render);
  execFileSync('magick', [...ico, join(build, 'icon.ico')]);

  // ICNS: 'icns', total length, then per size a type, its length and a PNG.
  // The types are Apple's for PNG payloads, 1x and 2x.
  /** @type {[string, number][]} */
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic11', 32], // 16 @2x
    ['ic12', 64], // 32 @2x
    ['ic07', 128],
    ['ic13', 256], // 128 @2x
    ['ic08', 256],
    ['ic14', 512], // 256 @2x
    ['ic09', 512],
    ['ic10', 1024], // 512 @2x
  ];
  const entries = types.map(([type, size]) => {
    const png = readFileSync(render(size));
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  writeFileSync(join(build, 'icon.icns'), Buffer.concat([head, body]));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
