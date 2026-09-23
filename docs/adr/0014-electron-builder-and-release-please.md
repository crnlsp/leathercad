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
  from anything but the asar. `GrantFileProtocolExtraPrivileges` has to stay **on** while the
  renderer loads from `file://`. Turning it off needs a custom `app://` protocol first, which is a
  main-process change.
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
