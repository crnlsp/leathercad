# Security policy

## Reporting a vulnerability

Please report security problems **privately**, through GitHub's private vulnerability reporting:

**<https://github.com/crnlsp/leathercad/security/advisories/new>**

Don't open a public issue, pull request or discussion for a vulnerability. A private report stays
between you and the maintainer until a fix is released. It can then be published as a GitHub
security advisory, crediting you if you want to be named.

A useful report includes:

- the LeatherCAD version, shown in the status bar, and the operating system;
- what an attacker can do, and what they need first, such as the user opening a crafted `.lcp` file;
- the steps, or a file, that show it;
- the log if it helps: *Help → About LeatherCAD → Show log folder* opens the folder that holds it.
  The log stays on your machine and LeatherCAD never uploads it, so attach it yourself if it's
  relevant.

## Supported versions

Fixes go into the next release from `main`. Only the latest release is supported. There are no
back-ported fixes to older versions.

## What's in scope

LeatherCAD is a desktop app that works offline and loads no remote content. It makes one network
request: for your security, it checks whether the version you are using is the latest, so you hear
of fixes — security fixes among them — when they are released. When you ask it to check, the app
asks GitHub for the latest release (`api.github.com/repos/crnlsp/leathercad/releases/latest`). The
request carries nothing about you or your patterns, and nothing is downloaded or installed: a newer
release is only named, with a link to its page. The Flatpak never makes it, since Flathub keeps it
up to date. See
[ADR 0020](docs/adr/0020-update-discovery.md).

The things most worth reporting are:

- **Opening a file.** A `.lcp` project that crashes the app, hangs it, or gets anything to run.
- **The renderer boundary.** A way for the renderer to reach the operating system beyond the typed
  platform bridge. That includes reading, writing or opening a file the user didn't choose in one of
  the app's own dialogs, or getting a second window or a navigation. Printing counts too: the main
  process runs the CUPS client (`lpstat`, `lpoptions`, `lp`) for printing, and anything that gets it
  to run another command, or to send a job to a printer CUPS does not list, is in scope. See
  `docs/architecture.md` §5.
- **The packaged app.** Its Electron fuses, asar integrity, or the release pipeline and its
  artefacts. The renderer loads from a local `app://leathercad` origin that serves only bundled
  renderer assets; the `GrantFileProtocolExtraPrivileges` fuse is off. Files chosen by the user
  remain accessible only through the platform bridge, with its path grants.
- **A network connection.** Anything that gets the app to reach the network beyond the update
  check, or gets the update check to ask anywhere else, send anything about the user, or link
  anywhere but this project's releases. Chromium's spellchecker reached the network, fetching a
  dictionary from Google on Linux, until 1.5 turned it off.

Out of scope: problems that need an attacker who already controls the user's account or machine,
and bugs in a PDF viewer or printer driver that LeatherCAD's output merely passes through.
Inaccurate print output is a serious bug, but report it as a normal issue unless someone can cause
it on purpose.
