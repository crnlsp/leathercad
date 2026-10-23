---
paths:
  - 'apps/desktop/src/main/**'
  - 'apps/desktop/src/preload/**'
  - 'apps/desktop/src/shared/**'
  - 'apps/desktop/src/csp/**'
  - 'apps/desktop/electron-builder.config.mjs'
  - 'apps/desktop/build/**'
  - 'packages/platform/**'
---

# The main process, the preload and the platform boundary

The main process is the only code that touches the file system, the OS or the network. It treats
the renderer as untrusted: a bug or injected content there must not reach a file the maker did not
choose.

- **Every IPC argument arrives as `unknown`** *(strict)*. Declare it so at the handler and narrow
  it there, with a type guard, a zod schema or `=== true`. A parameter typed `string` or
  `Uint8Array` at the handler is a claim nobody checked.
- **Paths come from the maker, never the renderer** *(strict)*. A path is usable only when a
  dialog, the recent list or the launch arguments granted it (`pathGrants.ts`). The main process
  names its own files — recovery copies, preferences, logs — and the renderer refers to them by id.
- **The preload exposes verbs, not powers** *(strict)*. One narrow function per action, named in
  the shared `IPC` table. Never expose `ipcRenderer`, `fs` or a generic "invoke anything".
- **The window never reaches the network** *(strict)*. The renderer loads only from the app's own
  protocol, under the CSP, and makes no request of its own. External links go through
  `externalLinks.ts` and open in the system browser.
- **The main process reaches the network only for an operation an ADR approves** *(strict)*, such
  as a future update check against GitHub. Such an operation:
  - lives entirely in the main process, against a fixed `https:` host;
  - sends nothing from a project;
  - leaves the app fully working when it fails or is offline (`docs/product-spec.md`);
  - shows the renderer only its outcome, through a narrow IPC verb, never a URL the renderer can
    choose.

  The ADR also records what is sent and whether the maker can turn it off.
- **Writes are atomic** *(strict)*. A project, the preferences or a recovery copy is written beside
  the target and renamed into place (`atomicWrite.ts`, and the `PlatformHost.writeFile`
  contract), so a crash mid-write leaves the old file whole.
- **`PlatformHost` is the OS boundary, and its comments are its contract.** A method says what it
  returns, when it rejects, and what it does where a platform lacks the feature (`listPrinters` on
  Windows). Change the interface, the preload's bridge and the main-process handler together.
- **Log facts, not content.** Ids, codes and outcomes go in the log; a project's contents do not.
  The log stays on the machine (ADR 0015), but it is what a maker attaches to a bug report.
- **The main process has words too.** Menus and dialogs here use the main process's translator,
  never a literal string.

## Platform-dependent changes

Printing, packaging, dialogs, file paths and anything else that reaches the OS behave differently
on Linux, Windows and macOS (`docs/architecture.md` §7).

What CI covers:
- the unit tests and the packaged smoke test on all three;
- the e2e and pixel suites on Linux only;
- nothing that uses a real printer or a real native dialog.

So a pull request that changes this behaviour names each platform it was run on by hand, and lists
the others as unverified. A path or a line ending gets a test that passes on every platform, and
is never skipped on one. Print accuracy is claimed only with a measurement in
`docs/print-verification-log.md`.
