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
- the log if it helps: *Help → Show Log Folder* opens the folder that holds it. The log stays on your
  machine and LeatherCAD never uploads it, so attach it yourself if it's relevant.

## Supported versions

Fixes go into the next release from `main`. Only the latest release is supported. There are no
back-ported fixes to older versions.

## What's in scope

LeatherCAD is an offline desktop app. It makes no network connections and loads no remote content.
The things most worth reporting are:

- **Opening a file.** A `.lcp` project that crashes the app, hangs it, or gets anything to run.
- **The renderer boundary.** A way for the renderer to reach the operating system beyond the typed
  platform bridge. That includes reading, writing or opening a file the user didn't choose in one of
  the app's own dialogs, or getting a second window or a navigation. See `docs/architecture.md` §5.
- **The packaged app.** Its Electron fuses, asar integrity, or the release pipeline and its
  artefacts.

Out of scope: problems that need an attacker who already controls the user's account or machine,
and bugs in a PDF viewer or printer driver that LeatherCAD's output merely passes through.
Inaccurate print output is a serious bug, but report it as a normal issue unless someone can cause
it on purpose.
