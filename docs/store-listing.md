# The Microsoft Store listing

What the maintainer enters in Partner Center for LeatherCAD, and the steps to submit it (B5,
[ADR 0024](adr/0024-msix-package-for-the-microsoft-store.md)). The package is built and tested by
CI on every Windows build; making the listing live is the maintainer's, and not a release item.

## Before the first submission

1. **A Partner Center account**, the free individual one: <https://storedeveloper.microsoft.com>.
2. **Reserve the name** *LeatherCAD* (Apps and games → New product → MSIX or PWA app).
3. **Copy the identity** from the product's *Product identity* page into `appx` in
   `apps/desktop/electron-builder.config.mjs`, in a pull request of its own:
   - `Package/Identity/Name` → `identityName`
   - `Package/Identity/Publisher` (`CN=…`) → `publisher`
   - `Package/Properties/PublisherDisplayName` → `publisherDisplayName`

   Until then the package carries stand-ins that only CI's throwaway certificate matches. CI reads
   the publisher from the built manifest, so it keeps passing with the real values.
4. **Download the package**: the `msix-Windows` artifact of the release commit's *Installers*
   run (it is never attached to a GitHub release). The `.msix` in it is signed with CI's test
   certificate; Partner Center re-signs what it accepts.

## The submission

- **Pricing:** free; all markets.
- **Category:** Graphics and design (Productivity if that is not offered).
- **Privacy policy URL:** <https://github.com/crnlsp/leathercad/blob/main/SECURITY.md#whats-in-scope> —
  the app collects nothing, sends nothing about the maker or their patterns, and in the Store's copy
  makes no network request at all.
- **Age rating (IARC questionnaire):** a productivity tool; no violence, no user-generated content
  shared with others, no communication between users, no purchases, no location. Expect *3+* /
  *Everyone*.
- **Description:** the README's first paragraph — *Design leathercraft patterns — parts, stitch
  lines, holes — that print at exact 1:1 scale.* — and its feature list.
- **Screenshots:** `docs/images/design.png`, `docs/images/sheets.png` and `docs/images/print.png`,
  retaken with `pnpm docs:media` for the release (1366 × 768 or larger is accepted).
- **Support contact:** the repository's issues page.

### Restricted capabilities: why `unvirtualizedResources`

Partner Center asks why the package declares it. The answer:

> LeatherCAD keeps the maker's templates, settings, printer corrections and unsaved work in
> %APPDATA%\leathercad. Packaged, new files there would be private to the package and deleted when
> it is uninstalled, so a maker who reinstalls would lose every template they saved. The same
> folder is used by the app's standalone installer, which never deletes it. The package excludes
> only this folder from virtualization on Windows 11; Windows 10 offers no per-folder exclusion,
> so there it turns write virtualization off for the package.

`runFullTrust` is the standard capability of a packaged desktop (Electron) app.

## Once the listing is live

- `docs/getting-started.md`'s *Install* table gains the Store row, in place of its *not live yet*
  paragraph, and the README's download table loses its note; with one line: keep either the Store's
  copy or the `.exe`, not both. Both read the same data folder and so one single-instance lock —
  whichever starts second hands over to the first.
- The roadmap's *Code signing* row says the Store's copy needs no SmartScreen click.
- Each release: upload that release's `msix-Windows` package as a new submission. Automating it
  (the Store CLI from a protected environment) is a later step (the CI/CD plan's B5).
