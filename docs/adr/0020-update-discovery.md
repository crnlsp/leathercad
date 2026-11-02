# 20. The update check: one request to GitHub when the maker asks, and nothing installed

**Status:** Accepted
**Date:** 2026-10-20, revised 2026-10-23

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

- **When.** **Only when the maker asks**, never by itself: not as the app starts, not in the
  background, not on a timer. *Check now* in Settings › Updates asks, and so does the version at
  the status bar's left, whose tooltip says *Check for updates* and then what the check found. A
  spinner turns while it asks. There is no switch, since there is nothing automatic to turn off.
  The maintainer decided on 2026-10-23 that every request is one the maker made knowingly,
  revising the first decision of 2026-10-20, which asked once at every start.
- **Not twice in five minutes.** An answer stands for five minutes: until then neither the
  version nor *Check now* asks again, and each says how many minutes are left. The main process
  keeps the time, so the status bar, Settings and every window share it. A check that failed is
  not an answer and can be tried again at once.
- **What is sent.** One GET with an `Accept` header and nothing about the maker or their patterns:
  no identifier, no project data, no preferences. GitHub sees what any request shows — the
  address, and Chromium's user agent with the app's name and version. Electron's `net.fetch`
  makes it, so a system proxy applies. It gives up after ten seconds.
- **What is read.** The tag alone, in the `leathercad-vX.Y.Z` form (R4). A pre-release, a draft
  or any other tag is never announced. The link shown is built from the tag, never taken from the
  answer, so the answer can send the maker nowhere but this project's own releases page.
- **What is done.** Nothing is downloaded or installed. Once answered, the version in the status
  bar becomes a chip: a sage tick for the latest, a tan arrow and the new number for a newer one,
  an orange triangle for a check that failed. Settings › Updates shows the same glyph on a card
  with what it means — the time of the check, or a link to the release page — and a newer release
  also puts a quiet mark on the Settings button and a line in About. An answer that could not be
  had, or could not be read, is said there just as quietly, and the app carries on.
- **Who is left out.** The Flatpak never asks: Flathub keeps it up to date, and its sandbox has
  no network. Settings › Updates says so instead of offering *Check now*, and its version in the
  status bar is plain text.
- **The renderer still connects to nothing.** It hears the answer over IPC. Its
  Content-Security-Policy keeps `connect-src 'self'`.

The tests never ask GitHub. `LEATHERCAD_RELEASES_URL` points the check elsewhere: the Playwright
configs point it at a port nothing listens on, and `e2e/updates.spec.ts` answers it from a server
of its own.

## Consequences

- `SECURITY.md` no longer says the app makes no network connections. It names this one request,
  and a way to get the app to make any other stays in scope.
- An app that is never asked makes no network connection at all, as before 1.6. A maker with no
  network who asks sees a line saying the check failed, in About and Settings, and nothing else.
- A maker who never asks never hears of a fix from the app. That is the price of the request
  being theirs alone; the release page and Flathub remain.
- GitHub's unauthenticated limit, 60 requests an hour from one address, is far above what anyone
  presses, and the five minutes keep a row of presses to one request. A check over it fails
  quietly, like any other.

## Alternatives rejected

- **Once at every start, on by default, with a switch to turn it off.** The first decision
  (2026-10-20): a maker hears of a fix without knowing to look. Rejected on 2026-10-23, because the
  app would reach the network on every start before the maker had asked it anything.
- **Off until the maker turns it on.** A switch for a check at start-up adds a setting without
  changing who decides: pressing *Check now* is already the maker's choice, made each time.
- **Ask on the first start.** A dialog before the first pattern, for a question most people answer
  without reading.
- **electron-updater or Squirrel.** They install, which is *Not planned*, and they need signed
  builds, which LeatherCAD does not ship.
- **Fetch from the renderer.** Its CSP would have to allow GitHub, and the window would hold a
  network capability it otherwise never needs.
