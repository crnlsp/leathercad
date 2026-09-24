# Production desktop integration (slice 8.5a) — design

**Date:** 2026-09-24
**Status:** Proposed with the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 7

---

## 1. The gap

The shipped app looked and behaved like a development build:
- The AppImage carried Electron's default icon, and its desktop entry had no description and no
  keywords.
- The desktop could not match a running window to its entry. Electron takes the window's app ID
  from `desktopName`, which was not set, so the taskbar showed a generic icon.
- Electron's default menu offered **View › Reload**, which throws unsaved work at the 5.3a question,
  and **Toggle Developer Tools**, a general-purpose console into the renderer.

## 2. What is built

### 2.1 The icon

- **The design:** the product spec's own example, a card pocket with a curved thumb scoop, stitched
  on its three sewn sides with the scoop left open, as it is really made. It is a tan piece on the
  shell's dark ground, in the palette's own colours. The shapes are bold enough to read at 16 px.
- **One source**, `apps/desktop/build/icon.svg`. `pnpm icons:generate` renders:
  - `icon.png` (1024 px), the window icon on Linux, taken at run time;
  - `icons/16x16.png` … `512x512.png`, the AppImage's icon set;
  - `icon.ico` (16–256 px) for Windows;
  - `icon.icns` (16–1024 px, PNG entries) for macOS. The script writes it itself, since a modern
    `.icns` is a type, a length and a PNG per size.

  The output is committed, as the glyph outlines are, so packaging needs no image tools.
  `rsvg-convert` and `magick` are needed only to regenerate, and no dependency is added.

### 2.2 The desktop entry

- `desktopName: leathercad.desktop` in the package, and `syncDesktopName`, so the entry's file name
  and `StartupWMClass` match the window's app ID.
- It adds GenericName (*Leathercraft pattern designer*), Keywords, a Comment and the Graphics
  category.
- MIME registration for `.lcp` stays in 8.5 (1.1).

### 2.3 The menu

- **Layout:**
  - File: New, Open…, Save, Save As…, Export PDF…, Quit.
  - Edit: Undo, Redo, Cut, Copy, Paste, Select All.
  - View: Full Screen.
  - Help: Show Log Folder, About.
  - On macOS: the app menu (About, Hide, Quit) and the Window menu.
- **Reload, Force Reload and Toggle Developer Tools** appear only when `app.isPackaged` is false.
- **An item doesn't act itself.**
  - It sends a `MenuAction` to the renderer through a new `PlatformHost.onMenuAction`, and the
    renderer runs the same handler as the keyboard shortcut.
  - The shortcut is **shown but not registered** (`registerAccelerator: false`). The renderer
    already handles the key, and a registered accelerator would run the action twice.
- **Undo and Redo are the document's history.** Cut, copy and paste are the text fields' roles:
  without them, a field on macOS has no copy and paste.
- **Show Log Folder** opens the state directory that holds the log and the recovery copies, for
  reporting a problem.

**Found on the way:** document undo listened for Ctrl+Z alone, so Cmd+Z did nothing on macOS. It
now takes either, as the menu shows it.

## 3. Not in this slice

- Flatpak and `.lcp` MIME registration (8.5, 1.1).
- Windows and macOS builds, signing and notarisation (8.6). The `.ico` and `.icns` are ready for
  them.

## 4. Tests

- `src/main/menu.test.ts`:
  - no developer roles when packaged, on either platform, and present while developing;
  - each action item sends its action, with its accelerator shown and not registered;
  - the Edit roles;
  - About and Quit placed per platform;
  - Show Log Folder.
- `src/main/packaging.test.ts`:
  - `desktopName` matches the executable, and `syncDesktopName` is on;
  - each size in the Linux set is a PNG of that size;
  - the `.ico` and `.icns` hold their sizes.
- `e2e/menu.spec.ts`:
  - the menu is File, Edit, View, Help;
  - Edit › Undo and Redo change the document;
  - File › New asks the 5.3a question;
  - Ctrl+N asks once, not twice.
- `e2e/packaged/packaged.spec.ts`: the packaged app's menu has Quit and no reload or developer tools.
- **Inspected by hand, in the built AppImage:** `leathercad.desktop` has `Icon=leathercad`,
  `StartupWMClass=leathercad`, GenericName, Keywords, Comment and `Categories=Graphics;`. The
  hicolor set runs from 16 to 512 px.
