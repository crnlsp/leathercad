# 15. A local log and local crash dumps, nothing uploaded

**Status:** Accepted
**Date:** 2026-09-23

## Context

When the app fails on someone else's machine, nothing is left behind to say why. Renderer errors
vanish with the window, the main process writes nowhere, and a native crash leaves no dump. The
first report of a real-world failure would arrive with no evidence attached.

Two constraints shape the answer. The project declined IBM Plex's install-time telemetry
([ADR 0011](0011-one-vendored-typeface-outlined-on-paper.md)), so nothing may leave the machine by
default. And problems with a **pattern** already have exactly one channel: `Problem` codes surfaced
through `diagnose()` (slice 4.12a). A second user-facing error path is ruled out.

## Decision

**electron-log** (MIT) writes the main process's log. Electron's built-in **`crashReporter`** keeps
minidumps. Both are set up in `apps/desktop/src/main/diagnostics.ts`, before the app is ready.

- **Where.** `$XDG_STATE_HOME/leathercad/` (default `~/.local/state/leathercad/`): `logs/main.log`
  and `crashes/`. Logs and dumps are state, not configuration, so they stay out of
  `~/.config/leathercad`. See [file-format.md](../file-format.md) §6.
- **What.** One start-up line with the version, Electron and platform. Renderer console errors and
  warnings. Renderer and child-process deaths. An unresponsive window. Main-process uncaught
  exceptions, recorded through `uncaughtExceptionMonitor`, which observes without changing
  Electron's own handling.
- **How much.** One megabyte, rolled once to `main.old.log`.
- **Uploaded:** nothing. `crashReporter.start({ uploadToServer: false })`.
- **Shown to the user:** nothing. This records what went wrong with the *app* for whoever fixes it.
  What is wrong with a pattern still goes only through `diagnose()`.

`electron-log` is a devDependency that Vite bundles into the main process. No `node_modules` ships
([ADR 0014](0014-electron-builder-and-release-please.md)).

## Consequences

- A bug report can include a log. Asking for it is manual until there is a "copy diagnostics"
  action, which is a UI decision for a later slice.
- E2E runs write to the developer's own `~/.local/state/leathercad/logs/`, as they already use
  `~/.config/leathercad`.
- Crash upload (Sentry or a self-hosted GlitchTip) stays possible, as an opt-in. It needs an account
  and a privacy decision first. Nothing here assumes it.

## Alternatives rejected

- **A hand-written file logger.** Rotation, main/renderer formatting and encoding edge cases are
  what electron-log already does, in a small package with no dependencies.
- **`process.on('uncaughtException')` or electron-log's error handler.** Both *handle* the
  exception, which changes whether the app keeps running and whether Electron shows its dialog. A
  logging change should not change behaviour.
- **Upload by default.** Contradicts the telemetry stance of ADR 0011.
