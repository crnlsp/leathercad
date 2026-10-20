# 20. The update check: one request to GitHub as the app starts, and nothing installed

**Status:** Accepted
**Date:** 2026-10-20

## Context

Until 1.6 LeatherCAD made no network connections, and `SECURITY.md` said so. Nothing told a maker
that a newer release existed, so a fix, a security fix among them, reached only the people who
went to look for it. Roadmap item 8.9 asks the app to say when a new release exists, link to it,
and install nothing: installing from inside the app is *Not planned*.

Three questions decide the shape of this. When the app asks, what it sends, and who is left out.

## Decision

**The main process asks GitHub for the latest release** —
`GET https://api.github.com/repos/crnlsp/leathercad/releases/latest` — and compares its tag with
the running version (`apps/desktop/src/main/updates.ts`).

- **When.** Once as the app starts, **on by default**, so a maker hears of a fix without having to
  know to look. Settings › Updates turns it off, and its *Check now* asks whenever the maker
  presses it, whether the start does or not; so does the version at the status bar's left, whose
  tooltip says *Check for updates* and then what the check found. The maintainer decided the default on 2026-10-20.
- **What is sent.** One GET with an `Accept` header and nothing about the maker or their patterns:
  no identifier, no project data, no preferences. GitHub sees what any request shows — the
  address, and Chromium's user agent with the app's name and version. Electron's `net.fetch`
  makes it, so a system proxy applies. It gives up after ten seconds.
- **What is read.** The tag alone, in the `leathercad-vX.Y.Z` form (R4). A pre-release, a draft
  or any other tag is never announced. The link shown is built from the tag, never taken from the
  answer, so the answer can send the maker nowhere but this project's own releases page.
- **What is done.** Nothing is downloaded or installed. A newer release puts a quiet mark on the
  Settings button and a line in About and Settings › Updates, with a link to the release page.
  An answer that could not be had, or could not be read, is said there just as quietly, and the
  app carries on.
- **Who is left out.** The Flatpak never asks: Flathub keeps it up to date, and its sandbox has
  no network. Settings › Updates says so instead of offering the switch.
- **The renderer still connects to nothing.** It hears the answer over IPC. Its
  Content-Security-Policy keeps `connect-src 'self'`.

The tests never ask GitHub. `LEATHERCAD_RELEASES_URL` points the check elsewhere: the Playwright
configs point it at a port nothing listens on, and `e2e/updates.spec.ts` answers it from a server
of its own.

## Consequences

- `SECURITY.md` no longer says the app makes no network connections. It names this one request,
  and a way to get the app to make any other stays in scope.
- A maker who starts the app with no network sees a line saying the check failed, in About and
  Settings, and nothing else.
- GitHub's unauthenticated limit, 60 requests an hour from one address, is far above one a start.
  A check over it fails quietly, like any other.

## Alternatives rejected

- **Off until the maker turns it on.** Keeps the offline promise whole, but the people who most
  need a fix are the ones who never open Settings.
- **Ask on the first start.** A dialog before the first pattern, for a question most people answer
  without reading.
- **electron-updater or Squirrel.** They install, which is *Not planned*, and they need signed
  builds, which LeatherCAD does not ship.
- **Fetch from the renderer.** Its CSP would have to allow GitHub, and the window would hold a
  network capability it otherwise never needs.
