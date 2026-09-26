import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { LCP_EXTENSION, LCP_MIME } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

/**
 * Desktop integration as packaged (slice 8.5a), checked against the files it
 * names — so the configuration and the icons cannot drift apart unnoticed.
 */

const DESKTOP = resolve(import.meta.dirname, '../..');

interface BuilderConfig {
  executableName: string;
  directories: { buildResources: string };
  linux: { icon: string; syncDesktopName: boolean };
  win: { icon: string };
  mac: { icon: string };
  fileAssociations: { ext: string; mimeType: string; name: string }[];
  flatpak: { files: [string, string][]; finishArgs: string[] };
}

async function config(): Promise<BuilderConfig> {
  const url = pathToFileURL(join(DESKTOP, 'electron-builder.config.mjs')).href;
  return ((await import(url)) as { default: BuilderConfig }).default;
}

/** Width and height from a PNG's header. */
function pngSize(bytes: Buffer): [number, number] {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('desktop integration', () => {
  it('names the desktop entry for the window, so a desktop can match them', async () => {
    // Electron takes the window's app_id / WM_CLASS from `desktopName`; the
    // entry's StartupWMClass is synced to it. Without the match a desktop
    // cannot tell which entry a running window belongs to.
    const { executableName, linux } = await config();
    const pkg = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as {
      desktopName: string;
    };
    expect(pkg.desktopName).toBe(`${executableName}.desktop`);
    expect(linux.syncDesktopName).toBe(true);
  });

  it('has an icon drawn at every size the Linux set names', async () => {
    const { linux } = await config();
    for (const size of [16, 32, 48, 64, 128, 256, 512]) {
      const png = readFileSync(join(DESKTOP, linux.icon, `${size}x${size}.png`));
      expect(pngSize(png)).toEqual([size, size]);
    }
  });

  it('has a Windows .ico and a macOS .icns up to their largest sizes', async () => {
    const { win, mac } = await config();

    const ico = readFileSync(join(DESKTOP, win.icon));
    expect(ico.readUInt16LE(2)).toBe(1); // an icon, not a cursor
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));

    const icns = readFileSync(join(DESKTOP, mac.icon));
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const types: string[] = [];
    for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
      types.push(icns.subarray(at, at + 4).toString('ascii'));
    }
    expect(types).toEqual(expect.arrayContaining(['icp4', 'ic07', 'ic09', 'ic10']));
  });
});

describe('opening a project from the file manager (8.5)', () => {
  it('associates the extension and the type the app writes into every project', async () => {
    const { fileAssociations } = await config();
    expect(fileAssociations).toEqual([
      expect.objectContaining({ ext: LCP_EXTENSION, mimeType: LCP_MIME }),
    ]);
  });

  it('describes that type to Linux, by name and by the mimetype entry inside the file', async () => {
    const { flatpak } = await config();
    const [source, target] = flatpak.files.find(([, to]) => to.includes('/share/mime/'))!;
    expect(target).toBe('/share/mime/packages/io.github.crnlsp.leathercad.xml');

    const xml = readFileSync(source, 'utf8');
    expect(xml).toContain(`<mime-type type="${LCP_MIME}">`);
    expect(xml).toContain(`<glob pattern="*.${LCP_EXTENSION}"/>`);
    // The ODF convention: the first entry's name at byte 30, its contents after.
    expect(xml).toContain(`offset="30" value="mimetype${LCP_MIME}"`);
  });

  it('gives the Flatpak no network: the app never goes online', async () => {
    const { flatpak } = await config();
    expect(flatpak.finishArgs).not.toContain('--share=network');
    expect(flatpak.finishArgs).toContain('--filesystem=home');
  });
});
