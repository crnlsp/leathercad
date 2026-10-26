# 14. electron-builder for packaging, release-please for releases

**Status:** Accepted
**Date:** 2026-09-23

## Context

Until now nothing could be shipped. The E2E suite drove `apps/desktop/out` through the `electron`
package, and a user would have run something else: an asar archive inside a binary, with resources
resolved from a different place. A bug that lives only there was invisible until slice 8.5.

That is not hypothetical. The first packaged build this ADR produced opened a **blank window**.
With the `GrantFileProtocolExtraPrivileges` fuse off, Electron will not load `index.html`'s module
script from `file://`. Every other test was green.

## Decision

**electron-builder** (MIT) builds the Linux AppImage from `apps/desktop/electron-builder.config.mjs`.
`docs/architecture.md` §1.4 had already named it. It is a devDependency of `apps/desktop` only.

- **Nothing in `node_modules` ships.** The main process imports only Electron and Node built-ins,
  and Vite bundles everything else, `electron-log` included, into `out/`. So every dependency of
  `apps/desktop` is a devDependency, and the archive holds `out/` and `package.json`.
- **Fuses are set by electron-builder's `electronFuses` option**, not by `@electron/fuses` as a
  direct dependency. Off: `RunAsNode`, `NODE_OPTIONS`, the inspector arguments, and loading the app
  from anything but the asar. **R6 now also disables `GrantFileProtocolExtraPrivileges`:** the
  renderer loads from `app://leathercad/index.html`, as described in the amendment below.
- **A packaged smoke test runs on every pull request** (`pnpm test:packaged`, CI's `package` job).
  It launches the unpacked build, checks it runs from `app.asar` in the vendored typeface, and
  exports a PDF that `pdfinfo` reads as A4. The build it drives differs from the shipped one in a
  single fuse: the inspector arguments stay on, because Playwright attaches through them.
- **The AppImage is a CI artifact on every pull request**, kept for seven days.

**release-please** (Apache-2.0, a GitHub Action, not a dependency) owns versions. It keeps one pull
request open that bumps `package.json` and `apps/desktop/package.json` and writes `CHANGELOG.md`
from the conventional commits since the last release. Merging that pull request tags `vX.Y.Z`.
`release.yml` then builds the AppImage from the tag and attaches it to the release, with an SBOM
from `pnpm sbom`.

The SBOM is a **build** SBOM: it lists everything that went into the AppImage, build tooling
included. A production-only one would be empty, because nothing ships in `node_modules`.

Build provenance (`actions/attest-build-provenance`) is wired but skipped while the repository is
private. Attestations on a private repository need GitHub Enterprise Cloud.

## Consequences

- Slice 8.5 shrinks to icons, the desktop entry, `.lcp` MIME registration and Flatpak. The pipeline
  it would have built is here.
- `electron-builder` depends on `electron-winstaller`, whose install script is declined in
  `pnpm-workspace.yaml`. Windows is not built.
- The release pull request is opened with the workflow's own token, and GitHub does not run CI on
  pull requests opened that way. Its only changes are version numbers and the changelog. If that
  ever matters, a GitHub App token fixes it.
- `enableEmbeddedAsarIntegrityValidation` is on for when macOS and Windows builds exist. Electron
  does not implement it on Linux, so it protects nothing yet.

## Alternatives rejected

- **Electron Forge.** Equivalent capability. electron-builder was already the documented choice, and
  its fuse and AppImage support need no plugins.
- **semantic-release.** It publishes on every merge. release-please batches releases behind a pull
  request the owner merges, which suits a project that reviews every change.
- **changesets.** Built for publishing many npm packages. This repository publishes one application
  and no npm packages.

## R6 amendment — a bundled app origin (2026-10-23)

The built renderer now loads from `app://leathercad/index.html`, including in an unpackaged
preview. Before Electron is ready, the main process registers `app` as standard and secure, with
Fetch support and CORS enforcement. It grants neither CSP bypass nor service-worker support.
Once ready, `protocol.handle` serves only files beneath `out/renderer` in the app's own directory
(inside `app.asar` when packaged). It never proxies a network request.

The handler accepts only GET and HEAD for the `leathercad` host, with no credentials or port. It
decodes the path once, rejects traversal and Windows path syntax, and verifies the resolved path
and its real target remain inside the renderer directory. Missing files and directories fail;
there is no HTML fallback for an absent script. Electron's `net.fetch` reads the validated file
URL, preserving MIME handling and asar support. Files chosen by the maker still go through the
typed platform bridge and its path grants, never this protocol.

`GrantFileProtocolExtraPrivileges` is off in both release and smoke-test builds. The latter still
differs only in the inspector fuse. `pnpm dev` keeps its Vite URL and HMR, but a packaged app
ignores `ELECTRON_RENDERER_URL` even if inherited from the environment. Preferences remain in
`preferences.json`; this origin change needs no browser-storage migration.

Acceptance: a packaged app opens on the app origin, loads its vendored fonts and PDF preview
worker, and exports the existing measured print fixture with the file-protocol fuse off. Protocol
unit tests cover hostile paths and symlink escapes; packaged tests exercise the actual asar
handler, CSP and sandbox, and supply a development URL to prove it is ignored in a release.

## Amendment — the Windows installer from Linux (2026-10-23)

`pnpm package:win` (`tools/package-win.mjs`) builds the NSIS installer on Linux or macOS, so a
change to the Windows build can be tried on a Windows machine without building there. The bundles
are built on the host; electron-builder runs in its own image, `electronuserland/builder` with Wine
and Node 22, pinned by digest. electron-builder needs Wine to edit the `.exe`'s resources: its
icon, version information, and the hash `enableEmbeddedAsarIntegrityValidation` checks, without
which the installed app does not start. The image is a development tool and nothing from it ships.

Releases do not change: `release.yml` builds the installer on `windows-latest`, and `package.yml`
runs the packaged smoke test there, which a Wine build cannot. An installer from the container is
for trying, not for publishing.

Rejected: Wine installed on the host, which every contributor would have to set up and keep at a
version that works; and a Windows virtual machine in a container (`dockur/windows`), which
downloads and installs Windows before its first build.

## Amendment — an installer that asks (2026-10-26)

The Windows installer was one-click: it installed for the current user, in
`%LOCALAPPDATA%\Programs\LeatherCAD`, with both shortcuts and the `.lcp` association, and asked
nothing. It now asks, as electron-builder's assisted NSIS installer (`oneClick: false`):

- the **licence**, Apache-2.0 from the repository root, to accept before going on — on every run,
  an update included, since the app has no updater that would skip it;
- **for whom**: this user, with no administrator, or every user, in `Program Files`, which needs one
  for every install and update;
- **where**;
- a **desktop shortcut**, and whether **`.lcp` projects** open in LeatherCAD — a page of
  `build/installer.nsh`'s own, since electron-builder offers neither. It makes both on every
  install and undoes the one declined; the choice is kept in the install's registry key and offered
  again by the next install;
- in the uninstaller, whether to **remove the maker's data** in `%APPDATA%\leathercad` — settings,
  templates, recovery copies, the log — off unless ticked, and never on an update.

The Start menu entry is not optional: the taskbar pin and its *Recent* list are matched to it by the
AppUserModelID.

One install per account. electron-builder offers *for whom* even with LeatherCAD installed, and
choosing the other mode leaves two copies, two entries in *Installed apps*, and `.lcp` projects
opened by whichever registered last. `installer.nsh` skips that page when there is an install, and
refuses `/allusers` or `/currentuser` naming the other mode. It sees only the account that runs it
and the machine's install: another account's install for itself is not found, and that account
keeps its own copy.

A silent install (`/S`) takes every default, as before. Nothing in the app changes: it writes only
to its userData directory, never beside the executable, so `Program Files` being read-only does not
touch it.

Rejected: keeping one-click, which gave no choice at all; a choice of language, while the app
has only English (ADR 0018); and a component page, which NSIS has but electron-builder's assisted
installer does not use.
