# The top bar and Settings (slice 8.7)

**Status:** design agreed 2026-09-29 · **Slice:** 8.7, the first of three (8.7 → 8.8 → 8.9) at the top of
1.3 · **Supersedes:** the File menu note in
[`2026-09-24-sheets-workflow-design.md`](2026-09-24-sheets-workflow-design.md) §4.1

## 1. The problem

The window's top row is Electron's native menu: *File, Edit, View, Tools, Paper, Help*. Nearly
everything in it already lives in the bars below — the tools in the rail, the paper in the sheet
indicator, Undo and Redo and the views in the work bar, New, Open and Save in the project bar — so
the menu is a second, differently organised copy of the app. What only the menu has is a mix of
file actions (*Open Recent*, *Save As*), application information (*About*, *Third-Party Notices*,
*Show Log Folder*) and a reference (*Keyboard Shortcuts*), with no settings anywhere.

8.7 fixes the model, not the paint: **every action has one home**, and the application has a
settings surface that can grow.

## 2. Decisions

- **Linux and Windows have no application menu.** macOS keeps the minimal native menu the platform
  requires (§7.1).
- **The window keeps its operating-system title bar.** No frameless window, no merged title bar — as
  the sheets workflow design §4.4 decided.
- **The project bar gains three entry points:** the Project menu at its left, and Settings and Help
  at its right.
- **Settings is a sidebar window**, a long-lived surface. It starts with General, Appearance and
  Keyboard shortcuts; a section appears only when it has a real control. 8.9 adds Updates.
- **Keyboard shortcuts is a Settings section, not a Help item.** Ctrl+/ and `?` open Settings on
  it. The standalone shortcuts dialog goes.
- **Help is small:** help and information about the application, never configuration.
- **One menu component** serves the two dropdowns here and the right-click menu of 8.8.
- **Handlers are not duplicated.** A menu item calls the same function its key and its button call
  today.

## 3. The project bar

```
┌────────────────────────────────────────────────────────────────────────────────────────┬─────┐
│ [▭▾] Bifold wallet  Unsaved changes  [Save]     ▯▯▯▯+1 [5 sheets of A4 ▾] [Export PDF] │ ⚙ ? │
└────────────────────────────────────────────────────────────────────────────────────────┴─────┘
   │                                                                                       │
   Project menu                                                                      Settings, Help
```

- **Left, the project:** the Project menu button, the name, the save state, *Save*. The *New* and
  *Open* buttons leave the bar for the Project menu.
- **Right, the output**, unchanged: the sheet indicator and *Export PDF*, still the window's one
  primary action.
- **Then a 1 px `--shell-line` rule, and the application:** Settings (⚙) and Help (?), icon-only
  quiet buttons. The rule is information: past it is the application, not this project.
- **At the 860 px minimum width the bar still fits** — no control clipped or wrapped. New and Open
  give back about the space the three new buttons take, but that is an estimate: an end-to-end test
  at 860 px holds it (§10).
- **The same on every platform.** On macOS the native menu's *About* and *Settings…* open the same
  dialogs as these buttons.

## 4. The menus

Each menu owns one kind of thing. An item that belongs to none of them is not added to one.

### 4.1 Project menu — the project and its files

```
┌─────────────────────────────────┐
│ New project              Ctrl+N │
│ Open…                    Ctrl+O │
│ Save as…           Ctrl+Shift+S │
├─────────────────────────────────┤
│ Recent projects                 │
│ Bifold wallet                   │
│ ~/Leather/wallets               │
│ Card holder                     │
│ ~/Leather                       │
└─────────────────────────────────┘
```

- **Actions first, recent projects after.** The list grows and shrinks; the actions stay under the
  pointer.
- **A recent project is two lines:** its name (the file name without `.lcp`), then its folder with
  the home directory as `~`. Two projects of one name in different folders stay distinguishable,
  which is why the native menu showed the whole path.
- **Empty:** *Projects you open or save appear here.* in `--text-mute`, not a disabled item.
- **Clearing the list is not here.** It is in Settings › General, so this menu holds nothing
  destructive.
- *Save* and *Export PDF* are not repeated: they are buttons on the bar.

### 4.2 Help menu — help and the application

```
┌──────────────────────────┐
│ Open sample project      │
├──────────────────────────┤
│ About LeatherCAD         │
└──────────────────────────┘
```

- ***Open sample project*** stays because it is the app's tutorial by design (8.3: a finished
  pattern to take apart, in place of a tutorial). The empty parts list offers it too, but only while the
  project has no parts.
- ***About LeatherCAD*** opens §6.
- Everything else the native Help menu held has moved: *Keyboard Shortcuts* to Settings,
  *Third-Party Notices* and *Show Log Folder* into About.

## 5. Settings

### 5.1 The window

```
┌─ Settings ───────────────────────────────────────────────────────── ✕ ┐
│ General            │ Appearance                                       │
│┃Appearance         │                                                  │
│ Keyboard shortcuts │ Name the marks in the canvas legend        [ ]   │
│                    │ Off, the legend is a strip of marks until you    │
│                    │ open it.                                         │
│                    │                                                  │
│                    │ Show tool names in the rail                [✓]   │
│                    │ Off, each tool shows only its key. Below 1200 px │
│                    │ wide the rail shows only keys anyway.            │
│                    │                                                  │
└────────────────────┴──────────────────────────────────────────────────┘
```

- **A modal dialog in the window**, built on the existing `.dialog` surface, wider: `min(760px,
  100vw − 32px)`.
- **A fixed height** — `min(520px, 100vh − 64px)` — so changing section never resizes the window;
  a section longer than that scrolls inside its pane. The work bar keeps a fixed height for the same
  reason.
- **The sidebar is a vertical tab list:** arrow keys move between sections, and the pane is its
  tab panel.
- **Changes apply at once.** No *Save*, no *Cancel*: each control writes through the preferences
  store as the in-place toggles already do. Escape, ✕ and a click on the scrim close it.
- **It opens on General**, or on the section asked for: Ctrl+/ and `?` open Keyboard shortcuts.
  **Ctrl+,** (⌘, on macOS) opens it, the convention across desktop apps.
- **No window shortcut fires while the maker is typing.** The global key handler already ignores
  keys aimed at an `input` or a `textarea`; it also ignores a `select` and anything
  `contenteditable`, so a `?` typed into a name is a question mark and a letter typed on the sheet
  indicator is its own type-ahead. One pure function decides what counts as typing, and a unit test
  holds it.

### 5.2 Sections

| Section | Controls | Backed by |
|---|---|---|
| **General** | *Recent projects* — "The Project menu lists the last 10 projects you opened or saved." with how many are listed, and *Clear list* (disabled when there are none) | `PreferencesStore.clearRecent`, and the operating system's list, as the native menu cleared both |
| **Appearance** | *Name the marks in the canvas legend*; *Show tool names in the rail* | the existing `legendOpen`, and `toolRailCollapsed` inverted — the same state the legend's own toggle and the rail's toggle change |
| **Keyboard shortcuts** | the shortcut map, **read-only** — rebinding keys would change this pane, not the Settings structure around it — which gains *Ctrl+, Settings*; its *Ctrl+/ or ? This list* row stays | `SHORTCUT_GROUPS`, as the dialog shows it today |

**How it grows.** The sections are one list at the top of `SettingsDialog.tsx`: an id, a title and
the component that draws the pane. A new section is one entry. **No section is written before
LeatherCAD has a real, user-facing setting that belongs in it** — no placeholder, no "coming soon".
Editor, Canvas, Files and Printing are where this surface is expected to go, and each waits for its
first real setting. 8.9 adds **Updates**, with its first real setting.

## 6. About LeatherCAD

```
┌──────────────────────────────────────────────┐
│  [icon]  LeatherCAD                          │
│          Version 1.2.0                       │
│                                              │
│  Leathercraft patterns that print at exact   │
│  1:1 scale. Free and open source under the   │
│  Apache License 2.0.                         │
│  Source code on GitHub                       │
│                                              │
│  Reporting a problem? Attach the log.        │
│  [Show log folder]  [Third-party notices]    │
│                                     [Close]  │
└──────────────────────────────────────────────┘
```

- The one place the full-colour icon appears in the window: it is the product's picture, not
  chrome.
- The version comes from `getAppVersion`, which the host already has.
- *Source code on GitHub* is an ordinary `https:` link; the window-open handler already sends those
  to the browser and nothing else.
- *Show log folder* says why someone would want it. Both buttons call the same main-process
  functions the native menu called.
- On every platform, macOS's *About LeatherCAD* included, this dialog is the About, so it is the
  one place 8.9's update status is added.

## 7. Main process and the platform boundary

### 7.1 The native menu

- **Linux and Windows:** `Menu.setApplicationMenu(null)`.
- **macOS:** the app menu (*About LeatherCAD*, *Settings…* ⌘,, Services, Hide, Hide Others, Show
  All, Quit), *Edit*
  (Undo and Redo as today, then the roles cut, copy, paste and select all, without which a text
  field has no copy and paste on macOS) and *Window*. About and Settings are sent to the renderer
  as menu actions, like every item now.
- `menu.ts` shrinks to that template. The File, View, Tools, Paper and Help menus go.

### 7.2 Keys the native menu gave

A key handler on the main window (`before-input-event`) restores what the menu's roles did on Linux
and Windows:

| Key | Does | Where |
|---|---|---|
| F11 | Toggle full screen | everywhere |
| Ctrl+Q | Quit, through the window's close, so unsaved work is asked about | Linux, Windows |
| Ctrl+Shift+I, F12 | Developer tools | development builds only |

Chromium handles cut, copy, paste and select all in text fields itself on Linux and Windows.

### 7.3 The host

New `PlatformHost` methods, each one IPC channel in `shared/ipc.ts`, the preload bridge and the
fake:

| Method | Does |
|---|---|
| `getRecentFiles()` | The recent list: each absolute path, and the path as shown, with `~` |
| `openRecent(path)` | The main process checks the path is on its list, grants it and sends it back through `openFile`, exactly as the native item did — or takes it off the list and says why, if it is gone |
| `clearRecent()` | Clears `preferences.json`'s list and the operating system's |
| `showLogFolder()` | Opens the log folder in the file manager |
| `openNotices()` | Opens the third-party notices window |

The renderer never names a file the main process did not give it: `openRecent` refuses a path that
is not on the list.

**Deleted:** `setPaperMenu`, `PaperMenuChoice`, `validPaperChoices`, the `IPC.setPaperMenu`
channel, the effect in `App.tsx` that sends the paper list, and the `tool:` and `paper:` menu
actions. The sheet indicator is the paper's one home.

## 8. The menu component

One React component, `Menu`, draws both dropdowns now and the right-click menu in 8.8.

- **Anchored to a button** here (`aria-haspopup="menu"`, `aria-expanded`), or **to a point** in 8.8.
- `role="menu"` and `role="menuitem"`, roving focus: arrow keys, Home and End, Enter and Space,
  Escape. Escape and a click outside close it, and focus returns to the button.
- A menu's contents are **data** — label, shortcut, action — in a `.ts` file, so the shortcut map
  test can check them without a DOM (§10).
- No dependency.

## 9. Visual design

The window's visual language is fixed — UI Foundations, the four colour planes, the tokens in
`packages/render/src/theme/`. 8.7 adds no colour, no type size and no radius; `styles.css` still
defines no value of its own.

- **The Project menu button is a pattern piece.** Its glyph is the icon's card pocket — the outline
  with its thumb scoop, a dashed stitch line inside — drawn in the rail's mark grammar (cut weight
  for the outline, stitch weight for the stitching) at 16 px, with a small chevron. It is drawn in
  `--text-dim`, never tan: the accent means the user's own focus and the primary action
  ([UI Foundations](2026-09-17-ui-foundations-design.md) §5.3), and a tan logo would compete with
  *Export PDF*. This is the bar's one new expressive element; every other addition is quiet.
- **Settings and Help** are Lucide's `Settings` and `CircleHelp` (ADR 0017), 16 px, icon-only
  quiet buttons at `--h-control`, each with a tooltip naming it and its key.
- **Menus look as the parts list's ⋯ menu already does** — the one popup menu the window has: a
  raised surface on `--shell-900`, a `--shell-line` border, `--r-sm`, `--elevation-raised`, items in
  `--t-label` with an optional second line in `--text-dim`, hover and keyboard focus sharing
  `--shell-600`. Its styles become the shared `.menu` ones and the part menu moves onto the
  component, so the window keeps one menu, not two. New: a shortcut at the item's right in the
  rail's `kbd` style; separators; and *Recent projects* as a heading in `--t-label` `--text-dim`,
  sentence case, as the rail's group headings are.
- **Settings:** the sidebar on `--shell-800`, a step darker than the pane on `--shell-700`. The
  current section looks as the current tool does on the rail — `--shell-600` with a tan border —
  so "current" looks the same everywhere in the window. A setting is a row: its name in
  `--t-body`, one sentence in `--t-label` `--text-dim` saying what it changes, the control at the
  right. Toggles are native checkboxes with `accent-color: var(--tan)`.
- **Motion:** menus and dialogs appear without animation. Colour transitions stay at `--motion`,
  and reduced motion turns them off as it does now.
- **Copy:** sentence case; names say what happens (*New project*, *Clear list*, *Show log
  folder*); an empty state says what fills it.

## 10. Testing

- **Unit:**
  - What counts as typing: `input`, `textarea`, `select` and `contenteditable` targets do; the
    canvas, a button and the document body do not.
  - The macOS menu template: its items, that About and Settings send their actions, and that there
    is no File, View, Tools, Paper or Help menu.
  - `openRecent` refuses a path that is not on the list — held end to end, in
    `platform-boundary.spec.ts`, against the real IPC handler.
  - The shortcut map test (`main/shortcuts.test.ts`) reads the React menus' data instead of the
    native menu: every shortcut a menu shows is in the map.
- **End to end** (Playwright, the real app):
  - `menu.spec` is rewritten for the new menus: on Linux there is no application menu; the Project
    menu opens by mouse and by keyboard; a recent project opens through it; *Save as…* opens the
    save dialog; About shows the version.
  - Settings: each section opens; *Name the marks in the canvas legend* opens the legend at once
    and is still set after a restart; *Clear list* empties the Project menu's recent projects; Ctrl+/
    and `?` open Keyboard shortcuts; Ctrl+, opens General.
  - `sample.spec` and `sheets.spec` stop reading the native menu.
  - Copy and paste in the project name still work with no menu.
  - Typing `?` into the project name, or pressing Ctrl+/ or Ctrl+, there, types and opens nothing.
  - At an 860 × 600 window, every control of the project bar is inside the bar and none wraps.
  - The accessibility scan covers the open menus, Settings and About.
- **Visual:** the project bar baselines are retaken, and every changed image looked at.
- **README:** `pnpm docs:media` retakes the screenshots, which show the old bar.

## 11. Documents changed in the same pull request

- `docs/roadmap.md`: 8.7, 8.8 and 8.9 at the top of 1.3.
- `docs/getting-started.md`: *Help → Keyboard Shortcuts* becomes Settings › Keyboard shortcuts.
- `docs/file-format.md` §6: *File › Open Recent* becomes the Project menu's recent projects.
- `docs/architecture.md`, wherever it describes the application menu.
- The sheets workflow design §4.1: a note that 8.7 supersedes "the File menu keeps them".

## 12. Not in 8.7

- **The right-click menu and Copy and Paste** — 8.8 and after.
- **The update check** — 8.9.
- **Settings with no control behind them yet:** density (its token exists, the switch does not),
  a grid or snapping, default paper, units, rebinding keys.
- **Zoom in the menus.** Scroll and Ctrl+=, Ctrl+− and Ctrl+0 zoom; the shortcut map lists them.
