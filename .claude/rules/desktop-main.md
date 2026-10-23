---
paths:
  - 'apps/desktop/src/main/**'
  - 'apps/desktop/src/preload/**'
  - 'apps/desktop/src/shared/**'
  - 'apps/desktop/src/csp/**'
---

# The main process and the preload

The main process is the only code with the file system and the OS. It treats the renderer as
untrusted: a bug or injected content there must not reach a file the maker did not choose.

- **Every IPC argument arrives as `unknown`.** Declare it so at the handler and narrow it there —
  a type guard, a zod schema, `=== true`. A parameter typed `string` or `Uint8Array` at the handler
  is a claim nobody checked.
- **Paths come from the maker, never the renderer.** A path is usable only when granted by a
  dialog, the recent list or the launch arguments (`pathGrants.ts`). The main process names its own
  files — recovery copies, preferences, logs — and the renderer refers to them by id.
- **The preload exposes verbs, not powers.** One narrow function per action, named in the shared
  `IPC` table; never `ipcRenderer`, `fs` or a generic "invoke anything".
- **Nothing remote.** The app loads only from its own protocol, under the CSP. External links go
  through `externalLinks.ts`; nothing else opens a URL.
- **Writes are atomic.** A project, preferences or a recovery copy is written beside the target and
  renamed into place (`atomicWrite.ts`), so a crash mid-write leaves the old file whole.
- **Log facts, not content.** Ids, codes and outcomes go in the log; a project's contents do not.
  The log stays on the machine (ADR 0015), but it is what a maker attaches to a bug report.
- **The main process has words too.** Menus and dialogs here use the main process's translator,
  never a literal string.
