# Never lose work silently (slice 5.3a) — design

**Date:** 2026-09-23
**Status:** Proposed with the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 1 ·
[pre-1.0 audit](2026-09-23-pre-1.0-product-audit.md) §2.2, §5

---

## 1. The defect

Three ordinary actions destroyed unsaved work without a word:

| Action | What happened |
|---|---|
| Closing the window: the close button, Ctrl+Q, the window manager | The app quit. There was no guard in the main process and no `beforeunload` in the renderer |
| Opening another project | `store.reset` replaced the document and cleared its undo history |
| Starting again | There was no *New*, so the only way was to restart the app, which is the first row again |

And an untouched project read **"Save •"** and **"unsaved"** from launch, because the saved-document
marker started as `null`. A guard built on that state would have asked about a blank page.

## 2. What is built

- **A correct dirty state.**
  - The document the app starts with counts as saved.
  - Dirty is by identity (`savedDocument !== document`), so undoing back to the saved state is
    clean again, and a close then asks nothing.
- **One question, three ways in.**
  - `confirmDiscard(action)` resolves at once when the project is clean.
  - When it is dirty, it shows *Save changes to "Name"?*, with a sentence for the action ("If you
    close without saving, your changes are lost.") and three answers:
    - **Cancel.** Escape too. Nothing happens.
    - **Don't save.** The action goes ahead.
    - **Save.** It saves first. On an untitled project that is *Save as*, and backing out of the file
      dialog cancels the whole action. A failed write cancels it too, and the error is shown as
      before.
  - Focus starts on **Save**, the answer that loses nothing. Key events stop at the dialog, as in
    the delete dialog.
  - Only one question is shown at a time. A second close while it is on screen is answered by the
    first.
- **Closing the window** goes through the page's `beforeunload`. With unsaved work, the unload is
  refused, so Electron keeps the window and shows no dialog of its own, and the question is asked
  instead. An answer that lets it go calls `window.close()` again, past the guard.
  - Chosen over the main process's `close` event because `beforeunload` also covers a
    **reload**. Electron's default menu offers View › Reload (Ctrl+R), which would otherwise throw
    work away just as silently.
- **Opening** asks first.
- **New** (a header button and Ctrl+N) asks first. It then starts an empty, untitled, clean project:
  no path, no history.
- The Save button's tooltip names *Save as* (Ctrl+Shift+S), which had no visible way in.

## 3. Not in this slice

- **Crash recovery**, 5.3b. It uses the dirty state corrected here.
- **Recent files**, 5.3c, which is 1.1.
- A dirty mark in the window title, and trimming Electron's default menu (Reload, Toggle Developer
  Tools). The menu goes with release hygiene (8.5a).

## 4. Acceptance criteria

1. A new, untouched project shows *Save* with no dot and no "unsaved", and closing it asks nothing.
2. With unsaved work, closing the window asks. *Cancel* and Escape keep the window and the work.
   *Don't save* closes it.
3. *New* and Ctrl+N ask when there is unsaved work, then start an empty, clean project with no undo
   history. On a clean project they ask nothing.
4. *Open* and Ctrl+O ask when there is unsaved work. *Cancel* keeps it, and *Don't save* opens the
   other file.
5. *Save* in the question saves, then goes ahead. Backing out of the file dialog changes nothing.
6. Undoing back to what was saved is clean, and closing then asks nothing.
7. A reload asks as a close does.

## 5. Tests

- `e2e/unsaved-changes.spec.ts`, which covers every criterion above.
- Every other E2E teardown now ends its app with `closeApp()`, which destroys the window without the
  question. A finished test is not a maker closing a window. Before this, each test that ended
  dirty sat out Playwright's 60 s teardown timeout.
- A refused unload makes Chromium report a "leave page?" dialog over the debugging protocol. Electron
  never shows it, and Playwright's automatic dismissal then throws "No dialog is showing". The
  unsaved-changes tests dismiss it themselves.
