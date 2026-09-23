// @ts-check
/**
 * Packaging. See ADR 0014 and docs/architecture.md §5.
 *
 * `pnpm package` builds an AppImage in apps/desktop/release/. The app needs no
 * node_modules at run time — the main process imports only Electron and Node,
 * and Vite bundles everything else into out/ — so `files` is out/ alone and
 * every dependency is a devDependency.
 *
 * Fuses are Electron features compiled into the binary and switched off here,
 * where no JavaScript can switch them back on. They close the ways a shipped
 * Electron app is commonly turned into a general-purpose Node runtime.
 * `enableEmbeddedAsarIntegrityValidation` is set for when Windows and macOS
 * builds exist; Electron does not implement it on Linux.
 *
 * One fuse differs in the build the packaged smoke test drives:
 * `LEATHERCAD_PACKAGE_FOR_E2E=1` leaves the inspector arguments on, because
 * Playwright attaches to Electron through them. Everything else — asar, paths,
 * resources, the other fuses — is the shipped configuration.
 *
 * @type {import('electron-builder').Configuration}
 */
export default {
  appId: 'io.github.cornelisp.leathercad',
  productName: 'LeatherCAD',
  executableName: 'leathercad',
  copyright: 'Copyright © 2026 cornelisp',
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
  artifactName: '${productName}-${version}-${arch}.${ext}',
  linux: {
    target: ['AppImage'],
    category: 'Graphics',
    synopsis: 'Leathercraft patterns that print at exact 1:1 scale',
    // Icons, the desktop entry's MIME registration for .lcp, and Flatpak are
    // slice 8.5. Until then the AppImage carries Electron's default icon.
  },
  // Releases are uploaded by .github/workflows/release.yml, not by the builder.
  publish: null,
};
