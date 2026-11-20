# 24. An MSIX package for the Microsoft Store, from electron-builder's `appx` target

**Status:** Accepted
**Date:** 2026-11-20

Records B5 of [the 1.7 plan](../superpowers/plans/2026-11-03-release-1.7.md) and decision D16
(approved 2026-11-03). Builds on [ADR 0014](0014-electron-builder-and-release-please.md), which
chose electron-builder; this adds a target to it, not a dependency.

## Context

The Microsoft Store is to be the main Windows channel (the CI/CD plan's D10): it signs a package
for free, which ends SmartScreen's warning about the unsigned `.exe`, and it updates the app. A
Store package is an MSIX, and an MSIX installs a desktop app into a container. Two facts of that
container decide the design ([the installer spec §7](../superpowers/specs/2026-11-03-windows-installer-and-distribution-design.md#7-the-microsoft-store-and-msix-b5-readiness)):

- a file the app creates in AppData is written to a private, per-package copy, and is deleted with
  the package. A maker who reinstalled would lose every template, kept unsaved copy and printer
  correction, which the installer's own data rule (D12) never allows;
- the app's AppUserModelID is the package's, not the one the `.exe`'s shortcuts carry (R14).

## Decision

- **electron-builder's `appx` target**, built apart from `pnpm package` by `pnpm package:msix`
  (`electron-builder --win appx`), named `.msix`. Its documentation marks it beta; CI is what
  stands behind it (below). No new dependency: the target ships with `app-builder-lib`, and it
  downloads the Windows SDK's `makeappx` as electron-builder's other Windows targets download
  their tools.
- **The maker's data folder is not virtualized.** `build/AppxManifest.xml` is electron-builder's
  template plus two declarations: Windows 11's `virtualization:ExcludedDirectory` for
  `$(KnownFolder:RoamingAppData)\leathercad`, and, for Windows 10 1903 and later, which do not
  know it, `desktop6:FileSystemWriteVirtualization` `disabled` for the whole package. Windows 11
  takes the first and ignores the second. Both need the restricted capability
  `unvirtualizedResources`, justified to Store certification in `docs/store-listing.md`. So the
  `.exe` and the Store's copy read the same `%APPDATA%\leathercad`.
- **The Store updates it.** `process.windowsStore` makes the update check say so, as the Flatpak
  says Flathub does (`managedBy`, `updates.ts`), and the app does not set the `.exe`'s
  AppUserModelID inside the package.
- **Never attached to a release.** CI uploads it as `msix-Windows`, apart from `installers-Windows`
  which `release.yml` attaches. The maintainer uploads it to Partner Center; the Store signs it.
  The identity in `electron-builder.config.mjs` stands in for Partner Center's until the name is
  reserved.
- **Tested on every Windows build** (`installers.yml`, `tools/ci/windows-msix.ps1`): signed with
  a throwaway certificate, installed with `Add-AppxPackage`, started through `shell:AppsFolder`,
  a template saved from inside the package, the package removed and installed again — the
  template must still be there.

## Consequences

- With both the `.exe` and the Store's copy installed, they share one data folder and so one
  single-instance lock: the second to start hands over to the first. The listing says to keep one.
- Certification may question `unvirtualizedResources`. Without it, templates die with the package;
  the answer is in `docs/store-listing.md`.
- Upgrading electron-builder means comparing `build/AppxManifest.xml` with its template again.

## Alternatives rejected

- **The Store's packaged default, virtualized.** Loses the maker's work on reinstall (D16).
- **Microsoft's MSIX Packaging Tool or `makeappx` by hand.** A second packaging path to keep in
  step with electron-builder's configuration, for nothing the target does not do.
- **Moving the data out of AppData** (to Documents, say). Changes where every existing install
  keeps its data, for one channel.
