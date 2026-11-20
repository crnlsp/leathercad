import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { LCP_EXTENSION, LCP_MIME } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from '../shared/i18n.js';
import { APP_USER_MODEL_ID } from './appUserModelId.js';

/**
 * Desktop integration as packaged (slice 8.5a), checked against the files it
 * names — so the configuration and the icons cannot drift apart unnoticed.
 */

const DESKTOP = resolve(import.meta.dirname, '../..');

interface BuilderConfig {
  extraMetadata: { description: string };
  executableName: string;
  directories: { buildResources: string };
  appId: string;
  linux: {
    icon: string;
    synopsis: string;
    mimeTypes: string[];
    syncDesktopName: boolean;
    extraFiles: { from: string; to: string }[];
  };
  win: { icon: string };
  nsis: {
    oneClick: boolean;
    perMachine: boolean;
    deleteAppDataOnUninstall: boolean;
    installerLanguages: string[];
  };
  mac: { icon: string };
  appx: { customManifestPath: string; capabilities: string[]; languages: string[] };
  fileAssociations: { ext: string; icon: string; name: string }[];
  deb: { fpm: string[] };
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

/** The sizes an `.ico` holds, from its directory. */
function icoSizes(ico: Buffer): number[] {
  expect(ico.readUInt16LE(2)).toBe(1); // an icon, not a cursor
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
}

/** The entry types an `.icns` holds. */
function icnsTypes(icns: Buffer): string[] {
  expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
  expect(icns.readUInt32BE(4)).toBe(icns.length);
  const types: string[] = [];
  for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
    types.push(icns.subarray(at, at + 4).toString('ascii'));
  }
  return types;
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

    const sizes = icoSizes(readFileSync(join(DESKTOP, win.icon)));
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));

    const types = icnsTypes(readFileSync(join(DESKTOP, mac.icon)));
    expect(types).toEqual(expect.arrayContaining(['icp4', 'ic07', 'ic09', 'ic10']));
  });

  it('gives the running app the id the Windows shortcuts carry', async () => {
    // Otherwise a window started from a pinned shortcut is a second taskbar
    // button, and the jump list's recent documents belong to neither.
    const { appId } = await config();
    expect(APP_USER_MODEL_ID).toBe(appId);
  });

  it("installs on Windows for this user unless asked, and never removes the maker's data (R12)", async () => {
    // The data folder holds their templates and settings: the installer
    // spec's §2 rule. build/installer.nsh guards the folder and the scope.
    const { nsis } = await config();
    expect(nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      deleteAppDataOnUninstall: false,
    });
  });

  it("speaks the app's languages in the Windows installer, for which installer.nsh has words", async () => {
    const { nsis } = await config();
    const nsh = readFileSync(join(DESKTOP, 'build/installer.nsh'), 'utf8');
    expect(nsis.installerLanguages.map((lang) => lang.split('_')[0])).toEqual(
      SUPPORTED_LANGUAGES.map(({ tag }) => tag),
    );
    expect(nsh.match(/^LangString leathercadFolderRule /gm)).toHaveLength(
      SUPPORTED_LANGUAGES.length,
    );
  });

  it('describes the Windows installer and its shortcuts as Linux does, not as the workspace package', async () => {
    // package.json's description reads "Electron shell for LeatherCAD".
    const { linux, extraMetadata } = await config();
    expect(extraMetadata.description).toBe(linux.synopsis);
  });

  it('describes the app to catalogs, for the entry and the type it installs', async () => {
    // The AppImage's root is the app's directory, so `to` is where an
    // AppImage catalog looks: usr/share/metainfo/, named for the app id.
    const { appId, executableName, linux } = await config();
    const { from, to } = linux.extraFiles.find((file) => file.to.includes('metainfo'))!;
    expect(to).toBe(`usr/share/metainfo/${appId}.appdata.xml`);

    const xml = readFileSync(join(DESKTOP, from), 'utf8');
    expect(xml).toContain(`<id>${appId}</id>`);
    expect(xml).toContain(`<launchable type="desktop-id">${executableName}.desktop</launchable>`);
    expect(xml).toContain(`<mediatype>${LCP_MIME}</mediatype>`);
  });
});

describe('the Microsoft Store package (B5)', () => {
  it("leaves the maker's data folder unvirtualized, on Windows 11 and on Windows 10", async () => {
    // Otherwise the package's new files in %APPDATA%\leathercad are private to
    // it and go with it: a reinstall loses every template (decision D16).
    const { appx, directories } = await config();
    const manifest = readFileSync(
      join(DESKTOP, directories.buildResources, appx.customManifestPath),
      'utf8',
    );
    expect(manifest).toContain(
      '<virtualization:ExcludedDirectory>$(KnownFolder:RoamingAppData)\\leathercad</virtualization:ExcludedDirectory>',
    );
    expect(manifest).toContain(
      '<desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>',
    );
    expect(manifest).toContain('IgnorableNamespaces="desktop6 virtualization"');
    expect(appx.capabilities).toContain('unvirtualizedResources');
  });

  it("speaks the app's languages", async () => {
    const { appx } = await config();
    expect(appx.languages.map((lang) => lang.split('-')[0])).toEqual(
      SUPPORTED_LANGUAGES.map(({ tag }) => tag),
    );
  });

  it('has its tiles and Store logo at the sizes the manifest names', () => {
    for (const [name, size] of [
      ['StoreLogo', [50, 50]],
      ['Square44x44Logo', [44, 44]],
      ['Square150x150Logo', [150, 150]],
      ['Wide310x150Logo', [310, 150]],
    ] as const) {
      expect(pngSize(readFileSync(join(DESKTOP, 'build/appx', `${name}.png`)))).toEqual(size);
    }
  });
});

describe('opening a project from the file manager (8.5)', () => {
  it('associates the extension and the type the app writes into every project', async () => {
    const { fileAssociations, linux } = await config();
    expect(fileAssociations).toEqual([expect.objectContaining({ ext: LCP_EXTENSION })]);
    expect(linux.mimeTypes).toEqual([LCP_MIME]);
  });

  it('has the document icon every platform shows for a project file (R14)', async () => {
    // `icon: 'lcp'` is `lcp.ico` for Windows and `lcp.icns` for macOS.
    const { fileAssociations } = await config();
    expect(fileAssociations[0]?.icon).toBe('lcp');
    expect(icoSizes(readFileSync(join(DESKTOP, 'build/lcp.ico')))).toEqual(
      expect.arrayContaining([16, 32, 48, 256]),
    );
    expect(icnsTypes(readFileSync(join(DESKTOP, 'build/lcp.icns')))).toEqual(
      expect.arrayContaining(['icp4', 'ic07', 'ic09', 'ic10']),
    );
  });

  it('installs the document icon beside the type on Linux, in the .deb and the Flatpak (R14)', async () => {
    const { deb, flatpak } = await config();
    const xml = readFileSync(join(DESKTOP, 'build/linux/io.github.crnlsp.leathercad.xml'), 'utf8');
    const icon = /<icon name="([^"]+)"\/>/.exec(xml)?.[1];
    expect(icon).toMatch(/^io\.github\.crnlsp\.leathercad\./); // a Flatpak exports no other

    const installed = [
      ...deb.fpm.map((pair) => pair.split('=') as [string, string]),
      ...flatpak.files,
    ].filter(([, to]) => to.includes('/mimetypes/'));
    expect(installed).toHaveLength(2 * 7);
    for (const [from, to] of installed) {
      const size = /\/(\d+)x\1\/mimetypes\/([^/]+)\.png$/.exec(to);
      expect(size?.[2]).toBe(icon);
      expect(pngSize(readFileSync(from))).toEqual([Number(size?.[1]), Number(size?.[1])]);
    }
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

  it('gives the Flatpak no network: Flathub, not the app, says when it is out of date', async () => {
    const { flatpak } = await config();
    expect(flatpak.finishArgs).not.toContain('--share=network');
    expect(flatpak.finishArgs).toContain('--filesystem=home');
  });
});
