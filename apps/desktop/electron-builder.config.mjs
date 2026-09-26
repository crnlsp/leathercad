// @ts-check
import { join } from 'node:path';

/**
 * Packaging. See ADR 0014 and docs/architecture.md §5.
 *
 * `pnpm package` builds the current platform's installer in
 * apps/desktop/release/: an AppImage on Linux, an NSIS installer on Windows,
 * a universal dmg on macOS (8.6a). The app needs no
 * node_modules at run time — the main process imports only Electron and Node,
 * and Vite bundles everything else into out/ — so `files` is out/ alone and
 * every dependency is a devDependency.
 *
 * Fuses are Electron features compiled into the binary and switched off here,
 * where no JavaScript can switch them back on. They close the ways a shipped
 * Electron app is commonly turned into a general-purpose Node runtime.
 * `enableEmbeddedAsarIntegrityValidation` makes Windows and macOS refuse an
 * app.asar that has been altered since packaging; Electron does not implement
 * it on Linux.
 *
 * One fuse differs in the build the packaged smoke test drives:
 * `LEATHERCAD_PACKAGE_FOR_E2E=1` leaves the inspector arguments on, because
 * Playwright attaches to Electron through them. Everything else — asar, paths,
 * resources, the other fuses — is the shipped configuration.
 *
 * @type {import('electron-builder').Configuration}
 */

/** The .lcp type, as `LCP_MIME` in packages/persist writes it into every file. */
const LCP_MIME = 'application/vnd.leathercad.project';

export default {
  appId: 'io.github.crnlsp.leathercad',
  productName: 'LeatherCAD',
  executableName: 'leathercad',
  copyright: 'Copyright © 2026 crnlsp',
  directories: { output: 'release', buildResources: 'build' },
  files: ['out/**/*', 'package.json'],
  asar: true,
  // No native modules to rebuild: nothing in node_modules ships. See above.
  npmRebuild: false,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: process.env['LEATHERCAD_PACKAGE_FOR_E2E'] === '1',
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    // Must stay on while the window loads index.html from file://. With it
    // off, the packaged window stays blank: the packaged smoke test caught
    // exactly that. Turning it off means serving the renderer from a custom
    // protocol (`protocol.handle('app', …)`), a main-process change.
    grantFileProtocolExtraPrivileges: true,
  },
  // The licences, beside app.asar in every install (8.6b): LeatherCAD's own,
  // and the third-party notices the build wrote from what it bundled. The app
  // shows the notices from Help, from inside the archive.
  extraResources: [
    { from: '../../LICENSE', to: 'LICENSE.txt' },
    { from: 'out/renderer/THIRD_PARTY_NOTICES.txt', to: 'THIRD_PARTY_NOTICES.txt' },
  ],
  artifactName: '${productName}-${version}-${arch}.${ext}',
  // Double-click a .lcp to open it (slice 8.5): the NSIS installer registers
  // it for this user, the dmg's Info.plist declares it, and on Linux it is the
  // desktop entry's MimeType plus the shared-mime-info file below.
  fileAssociations: [
    {
      ext: 'lcp',
      name: 'LeatherCAD project',
      description: 'LeatherCAD project',
      mimeType: LCP_MIME,
      role: 'Editor',
    },
  ],
  // The icon is drawn once, in build/icon.svg, and rendered to each format by
  // `pnpm icons:generate` (slice 8.5a); the files are committed.
  linux: {
    target: ['AppImage'],
    icon: 'build/icons',
    category: 'Graphics',
    synopsis: 'Leathercraft patterns that print at exact 1:1 scale',
    description:
      'Design leathercraft patterns — parts, stitch lines, holes — that print at exact 1:1 scale.',
    // The desktop entry is named for `desktopName` in package.json, which is
    // also the window's app_id / WM_CLASS: without the match, a desktop cannot
    // tell which entry a running window belongs to, and shows a generic icon.
    syncDesktopName: true,
    desktop: {
      entry: {
        GenericName: 'Leathercraft pattern designer',
        Keywords: 'leather;leathercraft;pattern;stitch;sewing;template;print;',
      },
    },
  },
  // The Flatpak (slice 8.5), built by `pnpm package:flatpak` — separately from
  // `pnpm package`, because it needs flatpak-builder and the Flathub runtimes.
  // Electron's own base app, on the current Freedesktop runtime.
  flatpak: {
    runtime: 'org.freedesktop.Platform',
    runtimeVersion: '24.08',
    sdk: 'org.freedesktop.Sdk',
    base: 'org.electronjs.Electron2.BaseApp',
    baseVersion: '24.08',
    // What the sandbox lets it reach. The display — Wayland and X11 both, as
    // Electron picks between them at start-up — and the GPU for drawing;
    // the home directory, because a pattern is saved wherever the maker keeps
    // it and Open Recent reopens it from there after a restart, which a
    // portal's per-session grant cannot; nothing else. No network — the app
    // never goes online — and no audio.
    finishArgs: [
      '--socket=wayland',
      '--socket=x11',
      '--share=ipc',
      '--device=dri',
      '--filesystem=home',
    ],
    // The .lcp type, where a Flatpak exports shared-mime-info from.
    files: [
      [
        join(import.meta.dirname, 'build/linux/io.github.crnlsp.leathercad.xml'),
        '/share/mime/packages/io.github.crnlsp.leathercad.xml',
      ],
    ],
  },
  // Windows (8.6a): an NSIS installer, per user, no administrator needed.
  // Unsigned, by decision (roadmap 8.6, Code signing); electron-builder would
  // sign if CSC_LINK were ever set, with no change here.
  win: { target: ['nsis'], icon: 'build/icon.ico' },
  nsis: { oneClick: true, perMachine: false },
  // macOS (8.6a): one dmg for Apple silicon and Intel. Flipping the fuses
  // rewrites the binary and invalidates Electron's own signature, and an
  // arm64 app with no valid signature will not start at all — so, with no
  // Developer ID (roadmap 8.6, Code signing), it is signed ad hoc ('-'). Were
  // CSC_LINK ever set, electron-builder would find a real identity instead.
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    icon: 'build/icon.icns',
    category: 'public.app-category.graphics-design',
    identity: process.env['CSC_LINK'] === undefined ? '-' : undefined,
  },
  // Releases are uploaded by .github/workflows/release.yml, not by the builder.
  publish: null,
};
