# Crash recovery (slice 5.3b) — design

**Date:** 2026-09-23
**Status:** Built in the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 2 ·
[pre-1.0 audit](2026-09-23-pre-1.0-product-audit.md) §5

---

## 1. What it is for

A crash, a power cut or a killed process loses everything since the last save. `product-spec.md` §7
asks for "autosave every 60 s to a recovery sidecar". This slice is that and nothing more. It is not
a backup scheme and not version history, and it never touches the project file.

## 2. The accepted model

| | |
|---|---|
| **What is written** | The document's parameters, as an ordinary `.lcp` from `saveProject`: the same format, validated the same way on the way back in |
| **When** | At most once every 60 s, only while the project has unsaved changes, never during a drag transaction, and only when the document changed since the last copy |
| **Where** | `stateDirectory()/recovery/`: `~/.local/state/leathercad/recovery/` on Linux (XDG), and the app's user-data folder on Windows and macOS. Never beside the project, and never under a project's name |
| **One file per session** | `<pid>-<start time>.lcp`, so two running copies of the app never overwrite or delete each other's |
| **How recovery is detected** | At startup, a recovery file whose process is no longer running belongs to a session that did not end cleanly |
| **What is offered** | The newest valid one: "LeatherCAD did not close properly. Recover *Card holder*, last saved to recovery at 14:32?" with *Recover* and *Not now* |
| **Recovering** | Opens it as an **untitled, unsaved** project. *Save* asks where, so it can never land on the original file |
| **Not now** | Leaves the file where it is. It becomes this session's, and a clean exit deletes it. It is not destroyed on the spot |

## 3. Robustness

| Case | Behaviour |
|---|---|
| **Atomic writes** | The copy is written to `<name>.lcp.tmp` and renamed over `<name>.lcp`. A reader only ever sees a whole file |
| **A crash during the write** | The rename never happened. The previous copy is still whole, and at most a stray `.tmp` is left, which startup deletes and never reads |
| **A corrupt or incomplete copy** | `loadProject` refuses it. It is renamed to `.corrupt`, so it is never offered again but is kept for inspection, and the log names it. Startup carries on, and the next valid copy, if any, is offered |
| **No valid copy at startup** | Nothing is asked |
| **A clean save** | This session's copy is deleted once the project is clean. A clean project has nothing to recover |
| **A save while a copy is being written** | Writes and clears run in the order they were asked, so the clear waits for the write in flight and then removes it. Saving never leaves a stale copy that a later start would offer as newer unsaved work (fixed after 5.3b; `recovery.test.ts`) |
| **A clean exit while a copy is being written** | The exit's delete releases the session. A write that lands after it removes itself, so the next start offers nothing |
| **New or Open** | The same: the document that replaced it is clean, so the copy goes |
| **A clean close** | The main process deletes this session's copy, and any it took over by *Not now*, when the app quits normally |
| **The renderer crashes but the app keeps running** | The main process remembers it and leaves the copy on quit, so the next start offers it |
| **Two copies of the app at once** | Each has its own file. A copy whose process is alive is never offered or deleted by the other |
| **The original project** | Never written by recovery. The recovery path is always under the state directory, and restoring opens untitled |
| **A recovered project that is not yet saved** | Recovering writes this session's own copy at once, and only then removes the old file, so at every moment at least one copy exists |

## 4. The pieces

- **Main process** (`apps/desktop/src/main/recovery.ts`): a `RecoveryStore` over a directory, a pid
  and a clock, so it can be unit-tested against a temporary directory. It provides:
  - `write(bytes)`: atomic;
  - `clear()`;
  - `findAbandoned()`: the newest dead session's file, stray `.tmp` files removed;
  - `adopt(id)`: take a found file over, to delete at a clean exit;
  - `markCorrupt(id)`;
  - `releaseOnQuit()`.
- **The platform boundary.** Four new `PlatformHost` methods with IPC channels:
  - `writeRecovery`;
  - `clearRecovery`;
  - `findRecovery`;
  - `resolveRecovery(id, 'adopt' | 'corrupt')`.

  The fake host implements them in memory.
- **The renderer** (`useRecovery`):
  - a 60 s tick that writes when dirty, when not in a transaction, and when the document changed;
  - clearing when the project becomes clean;
  - the startup offer, through an in-app dialog in the same idiom as the unsaved-changes dialog.
- **The document store** exposes whether a transaction is open: `inTransaction` on its state.

## 5. Not in this slice

- Recent files (5.3c, 1.1).
- More than one recovery copy per session, or history. It is one file, overwritten.
- Recovering the view, the selection or the tool. Only the document comes back.

## 6. Acceptance criteria

1. With unsaved work, a recovery copy appears within the interval, and not while nothing is
   unsaved.
2. Killing the app and starting it again offers the project. *Recover* brings it back untitled and
   unsaved, with its parts and features exactly as they were.
3. *Not now* starts empty and keeps the copy. A clean exit then deletes it.
4. A save, *New* or *Open* that leaves the project clean deletes this session's copy. A clean close
   leaves no copy.
5. A corrupt copy is not offered, is not fatal, and is kept aside as `.corrupt`. A stray `.tmp` is
   ignored and removed.
6. Recovery never writes to the project's own path.

## 7. Tests

- **Unit** (`recovery.test.ts`, real files in a temporary directory):
  - atomic write, with no `.tmp` left behind;
  - a crash mid-write, simulated by a leftover `.tmp` next to an older whole file;
  - a live pid is never offered, and a dead one is;
  - newest first;
  - adopt, then release on quit;
  - corrupt files set aside;
  - clearing only this session's file.
- **E2E:**
  - kill the app with unsaved work and restart. The offer appears, *Recover* restores the project
    untitled and dirty, and the project file on disk is untouched;
  - *Not now* keeps the file until a clean exit;
  - a save leaves no copy.

  The interval is shortened for tests through `LEATHERCAD_RECOVERY_INTERVAL_MS`, and `XDG_STATE_HOME`
  points the state directory at a temporary folder.
