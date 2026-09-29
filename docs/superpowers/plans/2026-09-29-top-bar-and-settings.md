# The top bar and Settings (8.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Electron's native menu with LeatherCAD's own top bar — a Project menu, Help, and a sidebar Settings window — so every action has one home.

**Architecture:** One `MenuButton` React component, generalised from the parts list's existing ⋯ menu, draws every dropdown; menu contents are plain data built by pure functions in `menus.ts`. Five new `PlatformHost` methods let the renderer reach the recent list, the log folder and the notices through the main process, which keeps its file grants. On Linux and Windows the application menu is `null`; macOS keeps a minimal native menu whose About and Settings open the same React dialogs.

**Tech Stack:** Electron, React 19, TypeScript, Vitest (unit, node environment — no DOM), Playwright driving the real Electron app (e2e), `lucide-react` (already installed, ADR 0017).

**Spec:** [`docs/superpowers/specs/2026-09-29-top-bar-and-settings-design.md`](../specs/2026-09-29-top-bar-and-settings-design.md) — read it first.

## Global Constraints

- **No new dependency.**
- **`styles.css` writes no colour, no radius and no custom property of its own** (`apps/desktop/src/renderer/src/theme.test.ts`): colours as `var(--…)` from the theme, radii as `var(--r-sm|md|pill)`. The only local custom properties allowed are `--parts-w`, `--properties-w`, `--rail-w`.
- **Invariant 5:** components never write to the document store; a menu item calls the handler its key and its button already call.
- **One home per action.** Nothing is added to a menu because the native menu had it.
- **Copy:** sentence case. Names say what happens.
- **No window shortcut fires while the maker is typing** in an `input`, `textarea`, `select` or `contenteditable`.
- **Keyboard shortcuts is a read-only Settings section.** No section is written before a real setting exists for it.
- **pnpm is not on PATH.** Prefix every command with `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH";`.
- **Commits** are Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/top-bar-and-settings`. No private data (home paths, emails) in anything committed.
- **Unit tests:** `pnpm vitest run <file>`, from the repo root. **E2E:** `pnpm test:e2e -- <spec>` builds first; `pnpm exec playwright test <spec>` re-runs without a rebuild after `pnpm build`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/desktop/src/renderer/src/menus.ts` | create | `MenuEntry` data type; `focusAfter`; `projectMenu`, `helpMenu`, `recentParts` — pure |
| `apps/desktop/src/renderer/src/menus.test.ts` | create | tests for the above |
| `apps/desktop/src/renderer/src/Menu.tsx` | create | `MenuButton`: trigger + popup, focus, Escape, click-away, arrow keys |
| `apps/desktop/src/renderer/src/PartsList.tsx` | modify | `PartMenu` becomes a `MenuButton` |
| `packages/platform/src/host.ts`, `fake.ts`, `index.ts` | modify | new host methods, `RecentFile`; paper menu and most `MenuAction`s removed |
| `apps/desktop/src/shared/ipc.ts`, `preload/index.ts`, `renderer/src/platformBridge.ts` | modify | the channels for those methods |
| `apps/desktop/src/main/platformHandlers.ts`, `main/index.ts` | modify | the handlers; no menu on Linux/Windows; window keys |
| `apps/desktop/src/main/preferences.ts` (+ test) | modify | `shownPath` |
| `apps/desktop/src/main/menu.ts` (+ test) | rewrite | `macMenuTemplate`, `windowKeyFor` |
| `apps/desktop/src/renderer/src/ProjectBar.tsx` | modify | Project menu, Settings, Help; New/Open buttons gone; `ProjectMark` |
| `apps/desktop/src/renderer/src/AboutDialog.tsx` | create | About LeatherCAD |
| `apps/desktop/src/renderer/src/SettingsDialog.tsx` | create | Settings: sections list, General, Appearance, Keyboard shortcuts |
| `apps/desktop/src/renderer/src/ShortcutsDialog.tsx` | delete | moved into Settings |
| `apps/desktop/src/renderer/src/shortcuts.ts` | modify | `isTyping`; *Window* group |
| `apps/desktop/src/main/shortcuts.test.ts` | modify | map held to the React menus and the macOS menu; `isTyping` |
| `apps/desktop/src/renderer/src/App.tsx` | modify | wiring; paper-menu effect and old menu actions deleted |
| `apps/desktop/src/renderer/src/styles.css` | modify | shared menu styles, bar groups, Settings, About |
| `e2e/projectMenu.ts` | create | `fromProjectMenu(window, item)` for specs that pressed New/Open |
| `e2e/top-bar.spec.ts` | create | Project menu, Help, About, 860 px fit |
| `e2e/menu.spec.ts` → `e2e/window.spec.ts` | rename, rewrite | no app menu; window keys; zoom keys |
| other `e2e/*.spec.ts` | modify | stop pressing the removed buttons and reading the native menu |

---

### Task 1: One menu component

The parts list's ⋯ menu (`PartMenu` in `PartsList.tsx`) is the window's only popup menu. Generalise it into `MenuButton`, add arrow-key movement, and move `PartMenu` onto it. The window then has one menu, and the next tasks only add entries.

**Files:**
- Create: `apps/desktop/src/renderer/src/menus.ts`, `apps/desktop/src/renderer/src/menus.test.ts`, `apps/desktop/src/renderer/src/Menu.tsx`
- Modify: `apps/desktop/src/renderer/src/PartsList.tsx` (the `PartMenu` function, ~lines 216–310), `apps/desktop/src/renderer/src/styles.css` (`.part-menu-anchor`, `.part-menu`, `.menu-item`, `.menu-label`, `.menu-note`, `.tool kbd`)

**Interfaces:**
- Produces: `MenuItem`, `MenuEntry`, `focusAfter(key: string, current: number, count: number): number` from `menus.ts`; `MenuButton` from `Menu.tsx` with props `{ label: string; tooltip?: string; testId: string; className: string; align?: 'start' | 'end'; entries: readonly MenuEntry[]; onOpen?: () => void; children: ReactNode }`.

- [ ] **Step 1: Write the failing test**

`apps/desktop/src/renderer/src/menus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { focusAfter } from './menus.js';

describe('moving through a menu by keyboard (8.7)', () => {
  it('goes down and up, wrapping at either end, as menus do', () => {
    expect(focusAfter('ArrowDown', 0, 3)).toBe(1);
    expect(focusAfter('ArrowDown', 2, 3)).toBe(0);
    expect(focusAfter('ArrowUp', 0, 3)).toBe(2);
    expect(focusAfter('ArrowUp', 2, 3)).toBe(1);
  });

  it('starts from the first or last item when nothing in the menu has focus', () => {
    expect(focusAfter('ArrowDown', -1, 3)).toBe(0);
    expect(focusAfter('ArrowUp', -1, 3)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(focusAfter('Home', 2, 3)).toBe(0);
    expect(focusAfter('End', 0, 3)).toBe(2);
  });

  it('leaves every other key, and an empty menu, alone', () => {
    expect(focusAfter('a', 0, 3)).toBe(-1);
    expect(focusAfter('Enter', 1, 3)).toBe(-1);
    expect(focusAfter('ArrowDown', -1, 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/desktop/src/renderer/src/menus.test.ts`
Expected: FAIL — cannot resolve `./menus.js`.

- [ ] **Step 3: Write `menus.ts`**

```ts
import type { LucideIcon } from 'lucide-react';

/**
 * What a menu holds (8.7), as data: the Project and Help menus, a part's
 * actions, and 8.8's right-click menu are lists of these, drawn by
 * `MenuButton`. Data, so a test can read a menu — its shortcuts, above all —
 * without a DOM.
 */
export interface MenuItem {
  /** Its `data-testid`. */
  readonly id: string;
  readonly label: string;
  readonly onChoose: () => void;
  /** The shortcut shown at the right, as `shortcuts.ts` writes keys: `CmdOrCtrl+N`. */
  readonly keys?: string;
  /** A second line, in the dimmer text. */
  readonly note?: string;
  readonly icon?: LucideIcon;
  readonly danger?: boolean;
}

export type MenuEntry =
  | ({ readonly kind: 'item' } & MenuItem)
  | { readonly kind: 'separator' }
  /** A named run of items; with none, a line saying what would fill it. */
  | {
      readonly kind: 'group';
      readonly label: string;
      readonly items: readonly MenuItem[];
      readonly empty: string;
    };

/**
 * Where the arrow keys, Home and End move a menu's focus, among `count`
 * items: down and up wrap at the ends, as menus do. -1 for any other key, or
 * an empty menu.
 */
export function focusAfter(key: string, current: number, count: number): number {
  if (count === 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm vitest run apps/desktop/src/renderer/src/menus.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `Menu.tsx`**

The open/close behaviour is `PartMenu`'s, unchanged; what is new is the entries, arrow keys, Tab closing, and keys stopping here so a letter cannot switch tools behind an open menu (the dialogs do the same).

```tsx
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { Icon } from './icons/Icon.js';
import { focusAfter, type MenuEntry, type MenuItem } from './menus.js';
import { keysFor } from './shortcuts.js';
import { Tooltip } from './Tooltip.js';

/**
 * A button and the menu it opens (8.7): the Project and Help menus, and a
 * part's actions in Parts.
 *
 * The menu takes focus when it opens and gives it back when Escape closes
 * it — heard wherever focus is, since a click does not always leave it here.
 * A press anywhere else, or Tab, closes it too, so a menu never outlives the
 * thought that opened it (UI Foundations §7.1).
 */
export function MenuButton({
  label,
  tooltip,
  testId,
  className,
  align = 'start',
  entries,
  onOpen,
  children,
}: {
  /** The button's accessible name, and the menu's. */
  label: string;
  /** What the tooltip says while the menu is closed; the label if not given. */
  tooltip?: string;
  testId: string;
  className: string;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  entries: readonly MenuEntry[];
  /** Called as the menu opens, for a menu that shows something that changes. */
  onOpen?: () => void;
  /** The button's face. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Keys in a menu are the menu's: a letter must not change the tool behind it.
    event.stopPropagation();
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const next = focusAfter(
      event.key,
      items.indexOf(document.activeElement as HTMLElement),
      items.length,
    );
    if (next === -1) return;
    event.preventDefault();
    items[next]?.focus();
  };

  const choose = (item: MenuItem) => () => {
    setOpen(false);
    item.onChoose();
  };

  const isMac = navigator.userAgent.includes('Mac');
  const renderItem = (item: MenuItem) => (
    <button
      key={item.id}
      type="button"
      role="menuitem"
      className={item.danger === true ? 'menu-item danger' : 'menu-item'}
      data-testid={item.id}
      onClick={choose(item)}
    >
      <span className="menu-label">
        {item.icon !== undefined && <Icon of={item.icon} />}
        {item.label}
        {item.keys !== undefined && <kbd>{keysFor(item.keys, isMac)}</kbd>}
      </span>
      {item.note !== undefined && <span className="menu-note">{item.note}</span>}
    </button>
  );

  return (
    <div className="menu-anchor" ref={root}>
      <Tooltip text={open ? null : (tooltip ?? label)}>
        <button
          ref={trigger}
          type="button"
          className={className}
          data-testid={testId}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (!open) onOpen?.();
            setOpen((was) => !was);
          }}
        >
          {children}
        </button>
      </Tooltip>
      {open && (
        <div
          className={`menu ${align}`}
          role="menu"
          aria-label={label}
          data-testid={`${testId}-items`}
          onKeyDown={onMenuKey}
        >
          {entries.map((entry, index) => {
            if (entry.kind === 'item') return renderItem(entry);
            if (entry.kind === 'separator') {
              return <div key={`separator-${String(index)}`} className="menu-separator" role="separator" />;
            }
            // The heading is seen; the group's name is what is heard.
            return (
              <div key={entry.label} role="group" aria-label={entry.label}>
                <div className="menu-heading" aria-hidden="true">
                  {entry.label}
                </div>
                {entry.items.length === 0 ? (
                  <div role="menuitem" aria-disabled="true" tabIndex={-1} className="menu-item menu-empty">
                    {entry.empty}
                  </div>
                ) : (
                  entry.items.map(renderItem)
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Move `PartMenu` onto it**

In `PartsList.tsx`, replace the whole body of `PartMenu` (keep its doc comment and props) with:

```tsx
  return (
    <MenuButton
      label={`Actions for ${part.name}`}
      testId={`part-menu-${part.id}`}
      className="icon-toggle"
      align="end"
      entries={[
        {
          kind: 'item',
          id: `duplicate-part-${part.id}`,
          label: 'Duplicate',
          icon: Copy,
          note: 'A copy beside this one, with its own stitching',
          onChoose: () => onDuplicatePart(part.id),
        },
        ...(part.features.length > 0
          ? [
              {
                kind: 'item' as const,
                id: `delete-part-${part.id}`,
                label: 'Delete part',
                icon: Trash2,
                danger: true,
                onChoose: () => onRemovePart(part.id),
              },
            ]
          : []),
      ]}
    >
      <Icon of={Ellipsis} />
    </MenuButton>
  );
```

Import `MenuButton` from `./Menu.js`; drop the imports only `PartMenu` used (`useRef`/`useEffect`/`useState` only if nothing else in the file uses them — check with `pnpm typecheck`).

- [ ] **Step 7: Share the menu styles**

In `styles.css`, rename `.part-menu-anchor` → `.menu-anchor` and `.part-menu` → `.menu`, and change the `.menu` rule so it fits content and lines up either way:

```css
/* A button's menu (8.7): the Project and Help menus, and a part's actions.
   One look for every menu in the window. */
.menu-anchor {
  position: relative;
  flex: none;
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: max-content;
  min-width: 200px;
  max-width: 360px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--shell-line);
  border-radius: var(--r-sm);
  background: var(--shell-900);
  box-shadow: var(--elevation-raised);
}

.menu.start {
  left: 0;
}

.menu.end {
  right: 0;
}

.menu-separator {
  height: 1px;
  margin: 4px 0;
  background: var(--shell-line);
}

.menu-heading {
  padding: 6px 8px 2px;
  color: var(--text-dim);
  font: var(--t-label);
}

.menu-empty {
  color: var(--text-mute);
  font-weight: 400;
  cursor: default;
}

.menu-note {
  overflow-wrap: anywhere;
}
```

Keep whatever other declarations the old `.part-menu` rule had that are not above. Then put a shortcut at the item's right, in the look keys already have on the rail:

- `.menu-label`: change `display: inline-flex` to `display: flex`, so the label spans the item.
- The `.tool kbd` rule's selector becomes `.tool kbd, .menu-item kbd` — one look for keys.
- Add `.menu-item kbd { margin-left: auto; }`, with `gap` on `.menu-label` keeping it off the label.

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm vitest run apps/desktop/src && pnpm test:e2e -- e2e/shell.spec.ts e2e/accessibility.spec.ts`
Expected: all pass — the part menu's existing e2e coverage (duplicate and delete through `part-menu-*`, `duplicate-part-*`, `delete-part-*`) and the axe scan of a populated tree still hold. If an e2e test addresses `.part-menu` by class, change it to the `part-menu-<id>-items` test id.

Then `pnpm dev`, open a part's ⋯ menu, and check with a screenshot that it looks as before, and that ↓ ↑ Home End move and Escape returns focus to the ⋯ button.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/src/menus.ts apps/desktop/src/renderer/src/menus.test.ts apps/desktop/src/renderer/src/Menu.tsx apps/desktop/src/renderer/src/PartsList.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor(desktop): one menu component, from the part menu, with arrow keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The host reaches the recent list, the log and the notices

Additive: the native menu still works after this task. The renderer gains five methods, and the main process keeps every file decision.

**Files:**
- Modify: `packages/platform/src/host.ts`, `packages/platform/src/fake.ts`, `packages/platform/src/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/src/platformBridge.ts`
- Modify: `apps/desktop/src/main/preferences.ts`, `apps/desktop/src/main/preferences.test.ts`, `apps/desktop/src/main/menu.ts` (`recentLabel` only), `apps/desktop/src/main/platformHandlers.ts`, `apps/desktop/src/main/index.ts`
- Test: `e2e/platform-boundary.spec.ts`

**Interfaces:**
- Produces: `RecentFile { path: string; shown: string }` exported from `@leathercad/platform`; `PlatformHost.getRecentFiles(): Promise<readonly RecentFile[]>`, `openRecent(path: string): Promise<void>`, `clearRecent(): Promise<void>`, `showLogFolder(): Promise<void>`, `openNotices(): Promise<void>`; `shownPath(path: string, home: string): string` in `main/preferences.ts`.

- [ ] **Step 1: Write the failing unit test**

Append to `apps/desktop/src/main/preferences.test.ts` (add `shownPath` to its import from `./preferences.js`, and `sep` from `node:path`):

```ts
describe('a recent project as the maker reads it (8.7)', () => {
  const home = ['', 'home', 'maker'].join(sep);

  it('writes the home directory as ~', () => {
    expect(shownPath([home, 'Leather', 'Wallet.lcp'].join(sep), home)).toBe(
      ['~', 'Leather', 'Wallet.lcp'].join(sep),
    );
  });

  it('leaves a path outside it, and a sibling that only starts the same, whole', () => {
    const elsewhere = ['', 'srv', 'Wallet.lcp'].join(sep);
    expect(shownPath(elsewhere, home)).toBe(elsewhere);
    const sibling = `${home}2${sep}Wallet.lcp`;
    expect(shownPath(sibling, home)).toBe(sibling);
  });

  it('leaves every path whole when there is no home directory', () => {
    const path = ['', 'home', 'maker', 'Wallet.lcp'].join(sep);
    expect(shownPath(path, '')).toBe(path);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/desktop/src/main/preferences.test.ts`
Expected: FAIL — `shownPath` is not exported.

- [ ] **Step 3: Add `shownPath`, and let `recentLabel` use it**

In `main/preferences.ts` (import `sep` from `node:path` beside `extname, isAbsolute`):

```ts
/**
 * A path as the maker reads it (8.7): the home directory as `~`, and only the
 * home directory itself — not a sibling whose name starts the same.
 */
export function shownPath(path: string, home: string): string {
  return home !== '' && path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}
```

In `main/menu.ts`, make `recentLabel`'s body `return shownPath(path, home ?? '').replaceAll('&', '&&');` (import from `./preferences.js`; drop its own `sep` import if nothing else uses it). Task 5 deletes `recentLabel`.

Run: `pnpm vitest run apps/desktop/src/main` — Expected: PASS (the existing `recentLabel` tests still hold).

- [ ] **Step 4: Add the host methods**

`packages/platform/src/host.ts`, inside `PlatformHost` after `noteRecentFile`:

```ts
  /** The recent projects (8.2), most recent first, as the Project menu lists them (8.7). */
  getRecentFiles(): Promise<readonly RecentFile[]>;

  /**
   * Opens a project from the recent list (8.7). The main process opens only a
   * path on its own list: it grants it and hands it back through
   * `onOpenFile`, so unsaved work is asked about as for *Open*. One that is
   * gone is taken off the list, and the maker told why.
   */
  openRecent(path: string): Promise<void>;

  /** Empties the recent list, and the operating system's (8.7). */
  clearRecent(): Promise<void>;

  /** Opens the folder the log is in, to attach to a report (ADR 0015). */
  showLogFolder(): Promise<void>;

  /** Shows the licences of what the app ships (8.6b). */
  openNotices(): Promise<void>;
```

and after the `PlatformHost` interface:

```ts
/** A project on the recent list (8.7). */
export interface RecentFile {
  /** Absolute: what `openRecent` is given back. */
  readonly path: string;
  /** As the maker reads it, with the home directory as `~`. */
  readonly shown: string;
}
```

Export `RecentFile` from `packages/platform/src/index.ts`. In `fake.ts` (import `RecentFile`):

```ts
  getRecentFiles(): Promise<readonly RecentFile[]> {
    return Promise.resolve(this.recentFiles.map((path) => ({ path, shown: path })));
  }

  openRecent(path: string): Promise<void> {
    if (this.recentFiles.includes(path)) this.openFile(path);
    return Promise.resolve();
  }

  clearRecent(): Promise<void> {
    this.recentFiles.length = 0;
    return Promise.resolve();
  }

  showLogFolder(): Promise<void> {
    return Promise.resolve();
  }

  openNotices(): Promise<void> {
    return Promise.resolve();
  }
```

- [ ] **Step 5: The channels**

`shared/ipc.ts`, after `setPaperMenu`:

```ts
  getRecentFiles: 'platform:getRecentFiles',
  openRecent: 'platform:openRecent',
  clearRecent: 'platform:clearRecent',
  showLogFolder: 'platform:showLogFolder',
  openNotices: 'platform:openNotices',
```

`preload/index.ts`, after `noteRecentFile`:

```ts
  getRecentFiles: (): Promise<{ path: string; shown: string }[]> =>
    ipcRenderer.invoke(IPC.getRecentFiles),

  openRecent: (path: string): Promise<void> => ipcRenderer.invoke(IPC.openRecent, path),

  clearRecent: (): Promise<void> => ipcRenderer.invoke(IPC.clearRecent),

  showLogFolder: (): Promise<void> => ipcRenderer.invoke(IPC.showLogFolder),

  openNotices: (): Promise<void> => ipcRenderer.invoke(IPC.openNotices),
```

`platformBridge.ts`, in `PreloadBridge` (import `RecentFile`):

```ts
  getRecentFiles(): Promise<readonly RecentFile[]>;
  openRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;
  showLogFolder(): Promise<void>;
  openNotices(): Promise<void>;
```

- [ ] **Step 6: The handlers**

`registerPlatformHandlers` gains two parameters after `takeLaunchFile` and before `onPaperChoices` (which Task 5 deletes) — the two things only `index.ts` can do:

```ts
  /** Opens a project from the recent list, if it is on it (8.7). */
  openRecent: (path: string) => Promise<void>,
  /** Shows the third-party notices window (8.6b). */
  openNotices: () => void,
```

and, after the `noteRecentFile` handler (import `stateDirectory` from `./diagnostics.js`, `shownPath` from `./preferences.js`):

```ts
  // The recent list as the Project menu shows it (8.7). A path is only
  // opened because it is on this list — `openRecent` checks — so the
  // renderer cannot name its way to any other file.
  ipcMain.handle(IPC.getRecentFiles, () =>
    preferences.recentFiles.map((path) => ({ path, shown: shownPath(path, app.getPath('home')) })),
  );
  ipcMain.handle(IPC.openRecent, async (_event, path: unknown) => {
    if (typeof path === 'string') await openRecent(path);
  });
  ipcMain.handle(IPC.clearRecent, async () => {
    await preferences.clearRecent();
    app.clearRecentDocuments();
  });
  ipcMain.handle(IPC.showLogFolder, async () => {
    await shell.openPath(stateDirectory());
  });
  ipcMain.handle(IPC.openNotices, () => openNotices());
```

In `main/index.ts`, pass `(path) => openRecent(path)` and `openNotices` in the new positions of the `registerPlatformHandlers(...)` call. `openRecent` in `index.ts` already returns at once for a path not on the list; keep that line.

- [ ] **Step 7: Write the boundary test**

In `e2e/platform-boundary.spec.ts`, append to the existing test, before its `finally`:

```ts
    // Open Recent opens only what is on the recent list (8.7): naming a file
    // grants nothing.
    const named = join(dir, 'named.lcp');
    writeFileSync(named, 'not a project');
    await window.evaluate((path) => window.platform!.openRecent(path), named);
    expect(await attempt('read', named)).toBe('refused');
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm vitest run apps/desktop/src packages/platform && pnpm test:e2e -- e2e/platform-boundary.spec.ts e2e/preferences.spec.ts`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/platform apps/desktop/src/shared apps/desktop/src/preload apps/desktop/src/renderer/src/platformBridge.ts apps/desktop/src/main e2e/platform-boundary.spec.ts
git commit -m "feat(desktop): the renderer reaches the recent list, the log and the notices through the host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Project menu, Help and About

The project bar gains the Project menu at its left and Help at its right; *New* and *Open* leave the bar. About becomes a React dialog.

**Files:**
- Modify: `apps/desktop/src/renderer/src/menus.ts`, `menus.test.ts`, `ProjectBar.tsx`, `App.tsx`, `styles.css`
- Create: `apps/desktop/src/renderer/src/AboutDialog.tsx`, `e2e/projectMenu.ts`, `e2e/top-bar.spec.ts`
- Modify (e2e): `e2e/edge-scoop.spec.ts`, `e2e/printTest.ts`, `e2e/sheets.spec.ts`, `e2e/paper.spec.ts`, `e2e/unsaved-changes.spec.ts`, `e2e/visual/app.visual.spec.ts`, `e2e/phase-4-close-out.spec.ts`, `e2e/shell.spec.ts`, `e2e/sample.spec.ts`, `e2e/preferences.spec.ts`, `e2e/menu.spec.ts` (the notices test moves out)

**Interfaces:**
- Consumes: `MenuButton`, `MenuEntry` (Task 1); `RecentFile`, `getRecentFiles`, `openRecent`, `showLogFolder`, `openNotices` (Task 2).
- Produces: `projectMenu(actions: { newProject: () => void; open: () => void; saveAs: () => void; openRecent: (path: string) => void }, recent: readonly RecentFile[]): MenuEntry[]`; `helpMenu(actions: { openSample: () => void; about: () => void }): MenuEntry[]`; `recentParts(shown: string): { name: string; folder: string }`; test ids `project-menu`, `new`, `open`, `save-as`, `recent-<n>`, `help-menu`, `help-open-sample`, `help-about`, `about-dialog`, `about-version`, `about-log-folder`, `about-notices`, `about-close`; `fromProjectMenu(window: Page, item: 'new' | 'open' | 'save-as'): Promise<void>` in `e2e/projectMenu.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `menus.test.ts` (import `helpMenu, projectMenu, recentParts`):

```ts
describe('a recent project, in two lines (8.7)', () => {
  it('is its name without .lcp, then its folder', () => {
    expect(recentParts('~/Leather/wallets/Bifold wallet.lcp')).toEqual({
      name: 'Bifold wallet',
      folder: '~/Leather/wallets',
    });
  });

  it('reads Windows paths too', () => {
    expect(recentParts('~\\Leather\\Card holder.LCP')).toEqual({
      name: 'Card holder',
      folder: '~\\Leather',
    });
  });

  it('keeps the root when the project is at it', () => {
    expect(recentParts('/Wallet.lcp')).toEqual({ name: 'Wallet', folder: '/' });
  });
});

describe('the Project and Help menus (8.7)', () => {
  const noop = (): void => undefined;
  const actions = { newProject: noop, open: noop, saveAs: noop, openRecent: noop };

  it('puts the actions first and the recent projects after, so the actions stay put', () => {
    const entries = projectMenu(actions, [{ path: '/p/Wallet.lcp', shown: '/p/Wallet.lcp' }]);
    expect(entries.map((entry) => (entry.kind === 'item' ? entry.id : entry.kind))).toEqual([
      'new',
      'open',
      'save-as',
      'separator',
      'group',
    ]);
    const group = entries.at(-1)!;
    expect(group.kind === 'group' && group.items.map((item) => [item.label, item.note])).toEqual([
      ['Wallet', '/p'],
    ]);
  });

  it('opens a recent project by its whole path, not the one shown', () => {
    const opened: string[] = [];
    const entries = projectMenu({ ...actions, openRecent: (path) => opened.push(path) }, [
      { path: '/home/m/Wallet.lcp', shown: '~/Wallet.lcp' },
    ]);
    const group = entries.at(-1)!;
    if (group.kind !== 'group') throw new Error('no recent projects');
    group.items[0]!.onChoose();
    expect(opened).toEqual(['/home/m/Wallet.lcp']);
  });

  it('says what fills the recent list while it is empty', () => {
    const group = projectMenu(actions, []).at(-1)!;
    expect(group.kind === 'group' && group.empty).toBe('Projects you open or save appear here.');
  });

  it('keeps Help to help and the application: no configuration', () => {
    const labels = helpMenu({ openSample: noop, about: noop }).flatMap((entry) =>
      entry.kind === 'item' ? [entry.label] : [],
    );
    expect(labels).toEqual(['Open sample project', 'About LeatherCAD']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run apps/desktop/src/renderer/src/menus.test.ts`
Expected: FAIL — `projectMenu`, `helpMenu`, `recentParts` are not exported.

- [ ] **Step 3: Write the builders**

Append to `menus.ts` (add `import type { RecentFile } from '@leathercad/platform';`):

```ts
/**
 * The Project menu (8.7): the project and its files. The actions come first
 * and the recent projects after — the list grows and shrinks, and the actions
 * stay under the pointer. Save and Export PDF are buttons on the bar, so they
 * are not repeated here; clearing the list is in Settings, so this menu holds
 * nothing destructive.
 */
export function projectMenu(
  actions: {
    readonly newProject: () => void;
    readonly open: () => void;
    readonly saveAs: () => void;
    readonly openRecent: (path: string) => void;
  },
  recent: readonly RecentFile[],
): MenuEntry[] {
  return [
    { kind: 'item', id: 'new', label: 'New project', keys: 'CmdOrCtrl+N', onChoose: actions.newProject },
    { kind: 'item', id: 'open', label: 'Open…', keys: 'CmdOrCtrl+O', onChoose: actions.open },
    {
      kind: 'item',
      id: 'save-as',
      label: 'Save as…',
      keys: 'CmdOrCtrl+Shift+S',
      onChoose: actions.saveAs,
    },
    { kind: 'separator' },
    {
      kind: 'group',
      label: 'Recent projects',
      empty: 'Projects you open or save appear here.',
      items: recent.map((file, index) => {
        const { name, folder } = recentParts(file.shown);
        return {
          id: `recent-${String(index)}`,
          label: name,
          note: folder,
          onChoose: () => actions.openRecent(file.path),
        };
      }),
    },
  ];
}

/**
 * The Help menu (8.7): help, and the application. Never configuration — that
 * is Settings'. The sample is here because it is the app's tutorial by design
 * (8.3): a finished pattern to take apart.
 */
export function helpMenu(actions: {
  readonly openSample: () => void;
  readonly about: () => void;
}): MenuEntry[] {
  return [
    { kind: 'item', id: 'help-open-sample', label: 'Open sample project', onChoose: actions.openSample },
    { kind: 'separator' },
    { kind: 'item', id: 'help-about', label: 'About LeatherCAD', onChoose: actions.about },
  ];
}

/**
 * A recent project's two lines (8.7): its name without `.lcp`, then its
 * folder — so two projects of one name in different folders can be told
 * apart. Either separator, since a Windows path uses `\`.
 */
export function recentParts(shown: string): { name: string; folder: string } {
  const cut = Math.max(shown.lastIndexOf('/'), shown.lastIndexOf('\\'));
  return {
    name: shown.slice(cut + 1).replace(/\.lcp$/i, ''),
    folder: cut === 0 ? shown.slice(0, 1) : shown.slice(0, Math.max(cut, 0)),
  };
}
```

Run: `pnpm vitest run apps/desktop/src/renderer/src/menus.test.ts` — Expected: PASS.

- [ ] **Step 4: Write `AboutDialog.tsx`**

The same dialog shape as `ShortcutsDialog` (backdrop, `role="dialog"`, focus the close button, Escape closes, keys stop here).

```tsx
import { useEffect, useRef } from 'react';

import iconUrl from '../../../build/icon.svg';
import { getPlatformHost } from './platformBridge.js';

/**
 * About LeatherCAD (8.7), from Help and from macOS's app menu: the one place
 * the application says what it is. The full-colour icon is the product's
 * picture, not chrome, so it is the one place in the window it appears.
 */
export function AboutDialog({ version, onClose }: { version: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const host = getPlatformHost();
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        data-testid="about-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="about-identity">
          <img src={iconUrl} width={64} height={64} alt="" />
          <div>
            <h3 id="about-dialog-title">LeatherCAD</h3>
            <p data-testid="about-version">Version {version ?? '…'}</p>
          </div>
        </div>
        <p>
          Leathercraft patterns that print at exact 1:1 scale. Free and open source under the
          Apache License 2.0.
        </p>
        {/* An https link: the window-open handler sends it to the browser. */}
        <p>
          <a href="https://github.com/crnlsp/leathercad" target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </p>
        <p className="dialog-note">Reporting a problem? Attach the log.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="tool"
            data-testid="about-log-folder"
            onClick={() => void host.showLogFolder().catch(() => undefined)}
          >
            Show log folder
          </button>
          <button
            type="button"
            className="tool"
            data-testid="about-notices"
            onClick={() => void host.openNotices().catch(() => undefined)}
          >
            Third-party notices
          </button>
          <button
            ref={closeRef}
            type="button"
            className="tool"
            data-testid="about-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

If `pnpm typecheck` rejects the `.svg` import, `vite/client` (already in `tsconfig.web.json`'s `types`) declares it; check the path resolves from `src/renderer/src` to `apps/desktop/build/icon.svg`.

- [ ] **Step 5: The project bar**

> **As built:** `ProjectBar` takes the handlers (`onNew`, `onOpen`, `onSaveAs`, `recent`, `onProjectMenuOpen`, `onOpenRecent`, `onOpenSample`, `onAbout`) and calls `projectMenu` / `helpMenu` itself. Building the entries in `App.tsx` fails the React compiler's `react-hooks/refs` lint: those handlers close over refs, and the builders run during render.

`ProjectBar.tsx`: replace the `onNew` / `onOpen` props with `projectMenu: readonly MenuEntry[]`, `onProjectMenuOpen: () => void` and `helpMenu: readonly MenuEntry[]`; delete the *New* and *Open* buttons; update the component's doc comment (the bar is now: the project with its menu, the output, then the application). New markup:

```tsx
    <header className="project-bar" data-testid="project-bar">
      <h1 className="visually-hidden">LeatherCAD</h1>
      <div className="project-identity">
        <MenuButton
          label="Project menu"
          tooltip="New, open, save as, and recent projects"
          testId="project-menu"
          className="tool quiet project-menu-button"
          entries={projectMenu}
          onOpen={onProjectMenuOpen}
        >
          <ProjectMark />
          <Icon of={ChevronDown} size={12} />
        </MenuButton>
        {/* name input, save state and Save: unchanged */}
      </div>

      <div className="project-output" role="group" aria-label="Output">
        {/* unchanged */}
      </div>

      {/* Past the rule is the application, not this project (8.7). */}
      <div className="project-app" role="group" aria-label="Application">
        <MenuButton
          label="Help"
          testId="help-menu"
          className="tool quiet icon-only"
          align="end"
          entries={helpMenu}
        >
          <Icon of={CircleHelp} />
        </MenuButton>
      </div>
    </header>
```

and, in the same file:

```tsx
/** The icon's stitching (build/icon.svg), in the 16 px box: down, along and up. */
const POCKET_HOLES: readonly (readonly [number, number])[] = [
  [4.6, 6.2], [4.6, 8.65], [4.6, 11.1], [6.87, 11.1],
  [9.13, 11.1], [11.4, 11.1], [11.4, 8.65], [11.4, 6.2],
];

/**
 * The Project menu's face (8.7): the icon's card pocket, drawn as the rail
 * draws a piece — the outline at the cut weight, the stitching as holes — in
 * the current colour. Never tan: the accent is the maker's own focus and the
 * primary action (UI Foundations §5.3).
 */
function ProjectMark() {
  return (
    <svg className="icon" width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2 2.5H5.46A2.62 2.62 0 0 0 10.54 2.5H14V12.4A1.3 1.3 0 0 1 12.7 13.7H3.3A1.3 1.3 0 0 1 2 12.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {POCKET_HOLES.map(([x, y]) => (
        <circle key={`${String(x)},${String(y)}`} cx={x} cy={y} r={0.65} fill="currentColor" />
      ))}
    </svg>
  );
}
```

Imports: `ChevronDown`, `CircleHelp` from `lucide-react`; `Icon` from `./icons/Icon.js`; `MenuButton` from `./Menu.js`; `type MenuEntry` from `./menus.js`.

- [ ] **Step 6: Styles for the bar**

The bar now has three groups; the output and the application sit together at the right.

```css
/* The output and the application sit at the right, the project at the left. */
.project-output {
  flex: none;
  margin-left: auto;
}

/* The application (8.7): past a rule, because none of it is this project. */
.project-app {
  display: flex;
  flex: none;
  gap: var(--space-1);
  align-items: center;
  padding-left: var(--space-3);
  border-left: 1px solid var(--shell-line);
}

.project-menu-button {
  gap: 2px;
  padding: 0 6px;
}

/* About (8.7): the icon beside the name and version. */
.about-identity {
  display: flex;
  gap: var(--space-4);
  align-items: center;
}

.dialog a {
  color: var(--text);
}
```

Merge the `.project-output` change into its existing rule (it already has `flex: none`). Check the `.project-bar` rule: `justify-content: space-between` now spreads three groups — change it to `justify-content: flex-start` (the `margin-left: auto` does the pushing).

- [ ] **Step 7: Wire it in `App.tsx`**

```tsx
  // The Project menu's recent projects (8.7), asked for each time it opens,
  // since saving and opening change them.
  const [recent, setRecent] = useState<readonly RecentFile[]>([]);
  const refreshRecent = useCallback(() => {
    void getPlatformHost()
      .getRecentFiles()
      .then(setRecent)
      .catch(() => undefined);
  }, []);
  const [aboutOpen, setAboutOpen] = useState(false);
```

Place these after `openSample` is defined. Pass to `ProjectBar`, replacing `onNew` / `onOpen`:

```tsx
        projectMenu={projectMenu(
          {
            newProject: () => void newProject(),
            open: () => void openProject(),
            saveAs: () => void file.save(true),
            // The main process checks it is on the list, grants it, and
            // hands it back through onOpenFile, which asks about unsaved work.
            openRecent: (path) => void getPlatformHost().openRecent(path).catch(() => undefined),
          },
          recent,
        )}
        onProjectMenuOpen={refreshRecent}
        helpMenu={helpMenu({ openSample: () => void openSample(), about: () => setAboutOpen(true) })}
```

and beside the other dialogs: `{aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}`. Import `type RecentFile` from `@leathercad/platform`, `helpMenu, projectMenu` from `./menus.js`, `AboutDialog`.

- [ ] **Step 8: The e2e helper, and specs that pressed New or Open**

`e2e/projectMenu.ts`:

```ts
import type { Page } from '@playwright/test';

/**
 * Chooses an item of the Project menu (8.7) — where *New project*, *Open…*
 * and *Save as…* live now the bar has no New and Open buttons. The items keep
 * the test ids the buttons had.
 */
export async function fromProjectMenu(window: Page, item: 'new' | 'open' | 'save-as'): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId(item).click();
}
```

In each of `e2e/edge-scoop.spec.ts`, `e2e/printTest.ts`, `e2e/sheets.spec.ts`, `e2e/paper.spec.ts`, `e2e/unsaved-changes.spec.ts`, `e2e/visual/app.visual.spec.ts`, `e2e/phase-4-close-out.spec.ts` and `e2e/shell.spec.ts`, replace every `await window.getByTestId('new').click();` with `await fromProjectMenu(window, 'new');` and every `await window.getByTestId('open').click();` with `await fromProjectMenu(window, 'open');`, and add `import { fromProjectMenu } from './projectMenu.js';` (`'../projectMenu.js'` in `visual/`). Find them all first:

Run: `grep -rn "getByTestId('new')\|getByTestId('open')" e2e`

A test that asserts something *about* the New or Open button (its tooltip, its presence) is deleted, not adapted — the button is gone.

In `e2e/sample.spec.ts`, replace the `app.evaluate(({ Menu }) => …'Open Sample Project'…)` block with:

```ts
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-open-sample').click();
```

(and drop `app` from that test's destructuring if nothing else uses it).

In `e2e/preferences.spec.ts`, replace `recentLabels(app)` with a helper reading the Project menu, and the *File › Open Recent* test's native click with a menu click:

```ts
/** The names under the Project menu's *Recent projects*, as it shows them now. */
async function recentNames(window: Page): Promise<string[]> {
  await window.getByTestId('project-menu').click();
  const names = await window
    .getByRole('group', { name: 'Recent projects' })
    .locator('.menu-label')
    .allTextContents();
  await window.keyboard.press('Escape');
  return names;
}
```

- first launch: `expect(await recentNames(first.window)).toEqual([]);`
- after saving: `await expect.poll(() => recentNames(first.window)).toEqual(['Wallet v1.2']);`
- reopening: `await second.window.getByTestId('project-menu').click(); await second.window.getByRole('menuitem', { name: /Wallet v1\.2/ }).click();`

Rename that test to `'a recent project reopens from the Project menu after a restart (8.7)'`.

- [ ] **Step 9: Write `e2e/top-bar.spec.ts`**

Each launch gets its own `XDG_CONFIG_HOME`, as in `preferences.spec.ts`, so no test sees another's recent projects. The *Third-Party Notices* test moves here from `e2e/menu.spec.ts`, opened from About.

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * Slice 8.7: the project bar's Project menu, Help and About. Each launch has
 * a config directory of its own, so no test sees another's recent projects.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-bar-'));

async function launch(configHome: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
  });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

async function drawAPanel(window: Page): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + 150, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
  await window.mouse.up();
  await expect(window.getByTestId('part-count')).toHaveText('1');
}

test('the Project menu opens by mouse and by keyboard, and gives focus back (8.7)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const button = window.getByTestId('project-menu');
    await button.focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('new')).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('open')).toBeFocused();
    await window.keyboard.press('End');
    // An empty recent list: its line is the last thing focus reaches.
    await expect(window.getByRole('menuitem', { name: /appear here/ })).toBeFocused();
    await window.keyboard.press('Home');
    await expect(window.getByTestId('new')).toBeFocused();
    // A letter is the menu's, not the tool rail's.
    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('project-menu-items')).toHaveCount(0);
    await expect(button).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('Save as… asks where, and saves there (8.7)', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Card holder.lcp');
  const { app, window } = await launch(fresh());
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await drawAPanel(window);
    await fromProjectMenu(window, 'save-as');
    await expect(window.getByTestId('file-path')).toContainText('Card holder');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
  } finally {
    await closeApp(app);
  }
});

test('About says the version, and shows the log folder and the notices (8.7, 8.6b)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const version = (await window.getByTestId('app-version').textContent()) ?? '';
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    const about = window.getByTestId('about-dialog');
    await expect(about.getByTestId('about-version')).toHaveText(`Version ${version}`);

    // The log folder opens in the file manager: caught here, not opened.
    await app.evaluate(({ shell }) => {
      shell.openPath = async (path: string) => {
        (globalThis as { openedPath?: string }).openedPath = path;
        return '';
      };
    });
    await about.getByTestId('about-log-folder').click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as { openedPath?: string }).openedPath ?? ''))
      .not.toBe('');

    // The file the build wrote from its own bundles: the renderer's packages,
    // main's, and the vendored typeface, each with its licence text.
    const opened = app.waitForEvent('window');
    await about.getByTestId('about-notices').click();
    const notices = await opened;
    await notices.waitForLoadState('domcontentloaded');
    const text = (await notices.locator('body').textContent()) ?? '';
    expect(text).toContain('LeatherCAD — third-party notices');
    for (const name of ['react 19', 'zod 4', 'electron-log 5', 'IBM Plex Sans']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('SIL OPEN FONT LICENSE');
    await notices.close();

    await about.getByTestId('about-close').click();
    await expect(about).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});
```

Delete the notices test from `e2e/menu.spec.ts`.

- [ ] **Step 10: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run apps/desktop/src && pnpm test:e2e -- e2e/top-bar.spec.ts e2e/preferences.spec.ts e2e/sample.spec.ts e2e/unsaved-changes.spec.ts e2e/paper.spec.ts e2e/edge-scoop.spec.ts e2e/sheets.spec.ts e2e/phase-4-close-out.spec.ts e2e/shell.spec.ts e2e/accessibility.spec.ts`
Expected: all pass.

`pnpm dev`, and look with a screenshot: the pocket mark at 16 px and at 2× reads as a pocket, not a smudge — if the holes merge, drop to six (no corner holes) — and the bar's three groups with the rule.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/renderer e2e
git commit -m "feat(desktop): a Project menu, Help and About in the project bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settings

**Files:**
- Create: `apps/desktop/src/renderer/src/SettingsDialog.tsx`
- Delete: `apps/desktop/src/renderer/src/ShortcutsDialog.tsx`
- Modify: `apps/desktop/src/renderer/src/shortcuts.ts`, `apps/desktop/src/main/shortcuts.test.ts`, `ProjectBar.tsx`, `App.tsx`, `styles.css`, `e2e/preferences.spec.ts`

**Interfaces:**
- Consumes: `focusAfter` (Task 1); `getRecentFiles`, `clearRecent` (Task 2); `refreshRecent`, `recent` state in `App.tsx` (Task 3).
- Produces: `type SettingsSection = 'general' | 'appearance' | 'shortcuts'`; `SettingsDialog` props `{ section: SettingsSection; onSection: (next: SettingsSection) => void; preferences: Preferences; onPreferences: (changes: Partial<Preferences>) => void; recentCount: number; onClearRecent: () => void; onClose: () => void }`; `isTyping(target: EventTarget | null): boolean` in `shortcuts.ts`; `ProjectBar` prop `onSettings: () => void`; test ids `settings`, `settings-dialog`, `settings-tab-<id>`, `settings-pane-<id>`, `settings-close`, `clear-recent`, `setting-legend-open`, `setting-tool-names`.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/main/shortcuts.test.ts` (import `isTyping`):

```ts
describe('what counts as typing (8.7)', () => {
  const at = (tagName: string, isContentEditable = false): EventTarget =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it('is a field, a text area, a list or anything editable', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTyping(at(tag)), tag).toBe(true);
    expect(isTyping(at('DIV', true))).toBe(true);
  });

  it('is not the canvas, a button, the page, or nothing', () => {
    for (const tag of ['CANVAS', 'BUTTON', 'BODY']) expect(isTyping(at(tag)), tag).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/desktop/src/main/shortcuts.test.ts`
Expected: FAIL — `isTyping` is not exported.

- [ ] **Step 3: Write `isTyping`, and the Settings keys in the map**

In `shortcuts.ts`:

```ts
/**
 * Whether a key is going into something the maker is typing in (8.7): a
 * field, a text area, a list — whose letters are its type-ahead — or anything
 * editable. The window's shortcuts leave those keys alone, so a `?` typed in
 * a name is a question mark.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (target === null || !('tagName' in target)) return false;
  const element = target as { readonly tagName: string; readonly isContentEditable?: boolean };
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable === true;
}
```

In `SHORTCUT_GROUPS`, take `{ keys: ['CmdOrCtrl+/', '?'], does: 'This list' }` out of *View* and add a group after *View*:

```ts
  {
    title: 'Window',
    shortcuts: [
      { keys: ['CmdOrCtrl+,'], does: 'Settings' },
      { keys: ['CmdOrCtrl+/', '?'], does: 'Keyboard shortcuts' },
    ],
  },
```

Run: `pnpm vitest run apps/desktop/src/main/shortcuts.test.ts` — Expected: PASS.

- [ ] **Step 4: Write `SettingsDialog.tsx`**

```tsx
import type { Preferences } from '@leathercad/platform';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Icon } from './icons/Icon.js';
import { focusAfter } from './menus.js';
import { SHORTCUT_GROUPS, keysFor } from './shortcuts.js';

export type SettingsSection = 'general' | 'appearance' | 'shortcuts';

interface Props {
  section: SettingsSection;
  onSection: (next: SettingsSection) => void;
  preferences: Preferences;
  onPreferences: (changes: Partial<Preferences>) => void;
  /** How many projects the Project menu lists. */
  recentCount: number;
  onClearRecent: () => void;
  onClose: () => void;
}

/**
 * The sections, in the sidebar's order (8.7). **A section is written only
 * when LeatherCAD has a real setting for it** — no placeholder, no "coming
 * soon" (spec §5.2). A new one is one entry here.
 */
const SECTIONS: readonly { id: SettingsSection; title: string; pane: (props: Props) => ReactNode }[] = [
  { id: 'general', title: 'General', pane: (props) => <General {...props} /> },
  { id: 'appearance', title: 'Appearance', pane: (props) => <Appearance {...props} /> },
  { id: 'shortcuts', title: 'Keyboard shortcuts', pane: () => <Shortcuts /> },
];

/**
 * Settings (8.7): the application's own, as a sidebar of sections — a
 * surface that grows a section when a setting needs one.
 *
 * Every change applies at once, through the same preference its in-place
 * control changes: there is no Save and no Cancel. A fixed height, so moving
 * between sections never resizes it. Keys stop here, as in the other dialogs,
 * so a letter typed in it cannot switch tools behind it.
 */
export function SettingsDialog(props: Props) {
  const { section, onSection, onClose } = props;
  const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]!;

  // Focus goes to the section it opened on, once: afterwards focus is the maker's.
  const openedOn = useRef(section);
  useEffect(() => {
    document.getElementById(`settings-tab-${openedOn.current}`)?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <header className="settings-header">
          <h3 id="settings-dialog-title">Settings</h3>
          <button
            type="button"
            className="tool quiet icon-only"
            aria-label="Close settings"
            data-testid="settings-close"
            onClick={onClose}
          >
            <Icon of={X} />
          </button>
        </header>
        <div className="settings-body">
          <div
            className="settings-sections"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Sections"
            onKeyDown={(event) => {
              const at = SECTIONS.findIndex((entry) => entry.id === section);
              const next = SECTIONS[focusAfter(event.key, at, SECTIONS.length)];
              if (next === undefined) return;
              event.preventDefault();
              onSection(next.id);
              document.getElementById(`settings-tab-${next.id}`)?.focus();
            }}
          >
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                aria-selected={entry.id === section}
                aria-controls="settings-pane"
                tabIndex={entry.id === section ? 0 : -1}
                className={entry.id === section ? 'settings-tab active' : 'settings-tab'}
                data-testid={`settings-tab-${entry.id}`}
                onClick={() => onSection(entry.id)}
              >
                {entry.title}
              </button>
            ))}
          </div>
          <div
            id="settings-pane"
            className="settings-pane"
            role="tabpanel"
            aria-labelledby={`settings-tab-${current.id}`}
            tabIndex={0}
            data-testid={`settings-pane-${current.id}`}
          >
            <h4>{current.title}</h4>
            {current.pane(props)}
          </div>
        </div>
      </div>
    </div>
  );
}

function General({ recentCount, onClearRecent }: Props) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-name">Recent projects</span>
        <span className="setting-note">
          The Project menu lists the projects you opened or saved most recently.{' '}
          {recentCount === 0
            ? 'None are listed now.'
            : `${String(recentCount)} ${recentCount === 1 ? 'is' : 'are'} listed now.`}
        </span>
      </div>
      <button
        type="button"
        className="tool"
        data-testid="clear-recent"
        disabled={recentCount === 0}
        onClick={onClearRecent}
      >
        Clear list
      </button>
    </div>
  );
}

function Appearance({ preferences, onPreferences }: Props) {
  return (
    <>
      <Toggle
        id="legend-open"
        name="Name the marks in the canvas legend"
        note="Off, the legend is a strip of marks until you open it."
        checked={preferences.legendOpen}
        onChange={(on) => onPreferences({ legendOpen: on })}
      />
      <Toggle
        id="tool-names"
        name="Show tool names in the rail"
        note="Off, each tool shows only its key. Below 1200 px wide the rail shows only keys anyway."
        checked={!preferences.toolRailCollapsed}
        onChange={(on) => onPreferences({ toolRailCollapsed: !on })}
      />
    </>
  );
}

/** One on-or-off setting: its name, what it changes, and the box. */
function Toggle({
  id,
  name,
  note,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  note: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const noteId = useId();
  return (
    <div className="setting">
      <div className="setting-text">
        <label className="setting-name" htmlFor={`setting-${id}`}>
          {name}
        </label>
        <span className="setting-note" id={noteId}>
          {note}
        </span>
      </div>
      <input
        id={`setting-${id}`}
        type="checkbox"
        data-testid={`setting-${id}`}
        aria-describedby={noteId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

/** Every key the app answers to (8.2), read-only until keys can be changed. */
function Shortcuts() {
  const isMac = navigator.userAgent.includes('Mac');
  return (
    <div className="shortcuts-groups">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h5>{group.title}</h5>
          <dl>
            {group.shortcuts.map((shortcut) => (
              <div className="shortcut-row" key={`${group.title}-${shortcut.does}`}>
                <dt>
                  {shortcut.keys.map((keys, index) => (
                    <span key={keys}>
                      {index > 0 && <span className="shortcut-or"> or </span>}
                      <kbd>{keysFor(keys, isMac)}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{shortcut.does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
```

Delete `ShortcutsDialog.tsx`.

- [ ] **Step 5: Styles**

In `styles.css`: rename the `.shortcuts-dialog` rule to `.settings-dialog`, move any `.shortcuts-dialog h4` selectors to `.settings-pane h5`, and add:

```css
/* Settings (8.7): a sidebar of sections and the pane they show. A fixed
   height, so moving between sections never resizes the dialog. */
.settings-dialog {
  width: min(760px, calc(100vw - 32px));
  height: min(520px, calc(100vh - 64px));
  padding: 0;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--shell-line);
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-sections {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 190px;
  padding: var(--space-2);
  background: var(--shell-800);
  border-right: 1px solid var(--shell-line);
}

/* The current section looks as the current tool does on the rail. */
.settings-tab {
  min-height: var(--h-control);
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-dim);
  font: var(--t-body);
  text-align: left;
  cursor: pointer;
}

.settings-tab:hover {
  color: var(--text);
}

.settings-tab.active {
  background: var(--shell-600);
  border-color: var(--tan);
  color: var(--text);
}

.settings-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-4);
}

.settings-pane h4 {
  margin: 0 0 var(--space-3);
  font: var(--t-panel);
}

.setting {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--shell-line);
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-name {
  font: var(--t-body);
}

.setting-note {
  color: var(--text-dim);
  font: var(--t-label);
  font-weight: 400;
}

.setting input[type='checkbox'] {
  flex: none;
  accent-color: var(--tan);
}
```

Check that `--h-control`, `--t-panel` and `--shell-800` are names `cssVariables` actually defines (`packages/render/src/theme/css.ts`); the theme test fails on any that is not.

- [ ] **Step 6: Wire it**

`ProjectBar.tsx`: add prop `onSettings: () => void`, and the button first in `.project-app`:

```tsx
        <Tooltip text="Settings (Ctrl+,)">
          <button
            type="button"
            className="tool quiet icon-only"
            data-testid="settings"
            aria-label="Settings"
            onClick={onSettings}
          >
            <Icon of={Settings} />
          </button>
        </Tooltip>
```

(`Settings` from `lucide-react`, `Tooltip` is already imported.)

`App.tsx`:

- Replace `const [shortcutsOpen, setShortcutsOpen] = useState(false);` with `const [settings, setSettings] = useState<SettingsSection | null>(null);` — `null` is closed.
- In the global `onKey` handler, replace the first two lines' `instanceof` check with `if (isTyping(event.target)) return;`; change `key === '/'`'s `setShortcutsOpen(true)` to `setSettings('shortcuts')`; add `else if (key === ',') { event.preventDefault(); setSettings('general'); }`; change the `?` branch to `setSettings('shortcuts')`.
- In the `onMenuAction` switch, `case 'shortcuts': setSettings('shortcuts'); break;` (Task 5 removes the action).
- General's count is asked for as Settings opens: `useEffect(() => { if (settings !== null) refreshRecent(); }, [settings, refreshRecent]);`
- Replace the `ShortcutsDialog` line with:

```tsx
      {settings !== null && (
        <SettingsDialog
          section={settings}
          onSection={setSettings}
          preferences={preferences}
          onPreferences={changePreferences}
          recentCount={recent.length}
          onClearRecent={() =>
            void getPlatformHost().clearRecent().then(refreshRecent).catch(() => undefined)
          }
          onClose={() => setSettings(null)}
        />
      )}
```

- Pass `onSettings={() => setSettings('general')}` to `ProjectBar`.
- Imports: `SettingsDialog, type SettingsSection` from `./SettingsDialog.js`, `isTyping` from `./shortcuts.js`; remove `ShortcutsDialog`.

- [ ] **Step 7: E2E**

In `e2e/preferences.spec.ts`, replace *'the keyboard shortcut map opens from the menu, from Ctrl+/ and from ?'* with:

```ts
test('Settings opens on General from the gear and Ctrl+, and on Keyboard shortcuts from Ctrl+/ and ? (8.7)', async () => {
  const { app, window } = await launch(mkdtempSync(join(tmpdir(), 'leathercad-e2e-keys-')));
  try {
    const dialog = window.getByTestId('settings-dialog');

    await window.getByTestId('settings').click();
    await expect(window.getByTestId('settings-pane-general')).toBeVisible();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('settings-pane-appearance')).toBeVisible();
    // A letter typed in Settings does not change the tool behind it.
    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press('Control+,');
    await expect(window.getByTestId('settings-pane-general')).toBeVisible();
    await window.getByTestId('settings-close').click();

    await window.keyboard.press('Control+/');
    await expect(window.getByTestId('settings-pane-shortcuts')).toContainText('Export PDF');
    await window.keyboard.press('Escape');
    await window.keyboard.press('Shift+?');
    await expect(window.getByTestId('settings-pane-shortcuts')).toBeVisible();
    await window.keyboard.press('Escape');

    // Typing is typing: none of the three opens anything from a text field.
    const name = window.getByTestId('project-name');
    await name.fill('Wallet');
    await name.press('Shift+?');
    await name.press('Control+/');
    await name.press('Control+,');
    await expect(name).toHaveValue('Wallet?');
    await expect(dialog).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('a setting applies at once and is kept, and Clear list empties the recent projects (8.7)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-settings-'));
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Strap.lcp');

  const first = await launch(configHome);
  try {
    // The legend shows only once there is something drawn for it to explain.
    await drawAPanel(first.window);
    await first.window.getByTestId('settings').click();
    await first.window.getByTestId('settings-tab-appearance').click();
    await first.window.getByTestId('setting-legend-open').check();
    await first.window.getByTestId('settings-close').click();
    await expect(first.window.getByTestId('canvas-legend-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await first.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await first.window.keyboard.press('Control+s');
    await expect.poll(() => recentNames(first.window)).toEqual(['Strap']);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    await second.window.getByTestId('settings').click();
    await second.window.getByTestId('settings-tab-appearance').click();
    await expect(second.window.getByTestId('setting-legend-open')).toBeChecked();

    await second.window.getByTestId('settings-tab-general').click();
    const general = second.window.getByTestId('settings-pane-general');
    await expect(general).toContainText('1 is listed now.');
    await general.getByTestId('clear-recent').click();
    await expect(general).toContainText('None are listed now.');
    await expect(general.getByTestId('clear-recent')).toBeDisabled();
    // Closed by its button: the disabled Clear list no longer holds focus.
    await second.window.getByTestId('settings-close').click();
    expect(await recentNames(second.window)).toEqual([]);
  } finally {
    await closeApp(second.app);
  }
});
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run apps/desktop/src && pnpm test:e2e -- e2e/preferences.spec.ts e2e/top-bar.spec.ts e2e/accessibility.spec.ts`
Expected: all pass. Then `pnpm dev`: open Settings, look at each section in a screenshot; check the dialog does not change size between sections.

- [ ] **Step 9: Commit**

```bash
git add -A apps/desktop/src e2e/preferences.spec.ts
git commit -m "feat(desktop): Settings, with General, Appearance and Keyboard shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: No native menu on Linux and Windows

**Files:**
- Rewrite: `apps/desktop/src/main/menu.ts`, `apps/desktop/src/main/menu.test.ts`
- Modify: `apps/desktop/src/main/index.ts`, `main/platformHandlers.ts`, `main/shortcuts.test.ts`, `shared/ipc.ts`, `preload/index.ts`, `packages/platform/src/host.ts`, `fake.ts`, `index.ts`, `renderer/src/platformBridge.ts`, `renderer/src/App.tsx`, `renderer/src/shortcuts.ts`
- Rename and rewrite: `e2e/menu.spec.ts` → `e2e/window.spec.ts`
- Modify: `e2e/sheets.spec.ts`, `e2e/packaged/packaged.spec.ts`

**Interfaces:**
- Consumes: the `about` and `settings` handlers in `App.tsx` (Tasks 3–4).
- Produces: `MenuAction = 'undo' | 'redo' | 'about' | 'settings'`; `macMenuTemplate(options: { send: (action: MenuAction) => void }): MenuItemConstructorOptions[]`; `windowKeyFor(input: Pick<Input, 'type' | 'key' | 'control' | 'shift' | 'alt'>, platform: { isMac: boolean; packaged: boolean }): 'full-screen' | 'quit' | 'developer-tools' | null`.

- [ ] **Step 1: Write the failing tests**

Replace `apps/desktop/src/main/menu.test.ts` with:

```ts
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { macMenuTemplate, windowKeyFor } from './menu.js';

const labels = (items: readonly MenuItemConstructorOptions[]): string[] =>
  items.map((item) => item.label ?? String(item.role));

describe('the macOS menu (8.7)', () => {
  const sent: string[] = [];
  const template = macMenuTemplate({ send: (action) => sent.push(action) });

  it('is only what the platform expects: the app menu, Edit and Window', () => {
    expect(labels(template)).toEqual(['LeatherCAD', 'Edit', 'windowMenu']);
  });

  it('opens the same About and Settings as the project bar', () => {
    const app = template[0]!.submenu as MenuItemConstructorOptions[];
    for (const [label, action] of [['About LeatherCAD', 'about'], ['Settings…', 'settings']] as const) {
      const item = app.find((entry) => entry.label === label)!;
      (item.click as () => void)();
      expect(sent.at(-1)).toBe(action);
    }
    expect(app.some((entry) => entry.role === 'quit')).toBe(true);
  });

  it('keeps cut, copy and paste, which text fields need on macOS', () => {
    const edit = (template[1]!.submenu as MenuItemConstructorOptions[]).map((entry) => entry.role);
    for (const role of ['cut', 'copy', 'paste', 'selectAll']) expect(edit).toContain(role);
  });

  it('shows shortcuts without registering them: the renderer handles the keys', () => {
    // Window is a role with no submenu of ours.
    const shown = template.flatMap(
      (top) => (top.submenu as MenuItemConstructorOptions[] | undefined) ?? [],
    );
    for (const item of shown.filter((entry) => entry.accelerator !== undefined)) {
      expect(item.registerAccelerator, item.label).toBe(false);
    }
  });
});

describe('the keys the native menu used to give (8.7)', () => {
  const linux = { isMac: false, packaged: true };
  const key = (key: string, mods: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {}) => ({
    type: 'keyDown' as const,
    key,
    control: false,
    shift: false,
    alt: false,
    ...mods,
  });

  it('toggles full screen with F11, everywhere', () => {
    expect(windowKeyFor(key('F11'), linux)).toBe('full-screen');
    expect(windowKeyFor(key('F11'), { isMac: true, packaged: true })).toBe('full-screen');
  });

  it('quits with Ctrl+Q off macOS, where the menu does it', () => {
    expect(windowKeyFor(key('q', { control: true }), linux)).toBe('quit');
    expect(windowKeyFor(key('q', { control: true }), { isMac: true, packaged: true })).toBeNull();
    expect(windowKeyFor(key('q', { control: true, shift: true }), linux)).toBeNull();
  });

  it('opens the developer tools only in a development build', () => {
    expect(windowKeyFor(key('F12'), linux)).toBeNull();
    expect(windowKeyFor(key('I', { control: true, shift: true }), linux)).toBeNull();
    const dev = { isMac: false, packaged: false };
    expect(windowKeyFor(key('F12'), dev)).toBe('developer-tools');
    expect(windowKeyFor(key('I', { control: true, shift: true }), dev)).toBe('developer-tools');
  });

  it('answers a key once, as it goes down', () => {
    expect(windowKeyFor({ ...key('F11'), type: 'keyUp' }, linux)).toBeNull();
  });

  it('leaves every other key to the page', () => {
    expect(windowKeyFor(key('s', { control: true }), linux)).toBeNull();
    expect(windowKeyFor(key('F5'), linux)).toBeNull();
  });
});
```

In `main/shortcuts.test.ts`, replace the `accelerators(menuTemplate(...))` test with:

```ts
  it('lists every shortcut a menu shows', () => {
    const noop = (): void => undefined;
    const shown = [
      ...projectMenu({ newProject: noop, open: noop, saveAs: noop, openRecent: noop }, []),
      ...helpMenu({ openSample: noop, about: noop }),
    ].flatMap((entry) => (entry.kind === 'item' && entry.keys !== undefined ? [entry.keys] : []));
    shown.push(...accelerators(macMenuTemplate({ send: noop })));
    expect(shown.length).toBeGreaterThan(0);
    for (const keys of shown) expect(listedKeys).toContain(keys);
  });
```

(imports: `helpMenu, projectMenu` from `'../renderer/src/menus.js'`, `macMenuTemplate` from `'./menu.js'`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run apps/desktop/src/main`
Expected: FAIL — `macMenuTemplate` and `windowKeyFor` do not exist.

- [ ] **Step 3: Rewrite `menu.ts`**

```ts
import type { MenuAction } from '@leathercad/platform';
import type { Input, MenuItemConstructorOptions } from 'electron';

/**
 * The application menu — on macOS only (8.7).
 *
 * Linux and Windows have none: the project bar holds the project's actions,
 * Settings and Help, each once. macOS keeps what the platform itself expects:
 * the app menu, Edit — whose roles are what give a text field copy and paste
 * there — and Window. Its About and Settings open the renderer's own dialogs,
 * the ones the project bar opens.
 *
 * Shortcuts are shown but not registered: the renderer handles the keys, and
 * a registered accelerator would run the action a second time.
 */
export function macMenuTemplate(options: {
  readonly send: (action: MenuAction) => void;
}): MenuItemConstructorOptions[] {
  const { send } = options;
  const action = (label: string, accelerator: string, sent: MenuAction): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(sent),
  });

  return [
    {
      // The first menu is the app menu, whatever its label says.
      label: 'LeatherCAD',
      submenu: [
        { label: 'About LeatherCAD', click: () => send('about') },
        { type: 'separator' },
        action('Settings…', 'CmdOrCtrl+,', 'settings'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        // Closing goes through the window, so unsaved work is asked about (5.3a).
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // The document's history, not a text field's.
        action('Undo', 'CmdOrCtrl+Z', 'undo'),
        action('Redo', 'CmdOrCtrl+Shift+Z', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { role: 'windowMenu' },
  ];
}

/** What a key the native menu's roles used to give does, now there is no menu (8.7). */
export type WindowKey = 'full-screen' | 'quit' | 'developer-tools';

/**
 * The window's own keys (8.7): full screen everywhere, Quit off macOS — where
 * the app menu has it — and the developer tools only in a development build,
 * as the menu offered them only there (8.5a).
 */
export function windowKeyFor(
  input: Pick<Input, 'type' | 'key' | 'control' | 'shift' | 'alt'>,
  platform: { readonly isMac: boolean; readonly packaged: boolean },
): WindowKey | null {
  if (input.type !== 'keyDown') return null;
  const key = input.key.toLowerCase();
  if (key === 'f11') return 'full-screen';
  if (!platform.isMac && input.control && !input.shift && !input.alt && key === 'q') return 'quit';
  if (!platform.packaged && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
    return 'developer-tools';
  }
  return null;
}
```

`recentLabel`, `validPaperChoices`, `MAX_PAPER_CHOICES`, `menuTemplate` and the `TOOL_GROUPS` import are gone.

- [ ] **Step 4: Narrow the platform and delete the Paper menu's path**

- `host.ts`: `MenuAction` becomes

```ts
/** What macOS's native menu can ask the renderer to do (8.7). */
export type MenuAction = 'undo' | 'redo' | 'about' | 'settings';
```

  Update `onMenuAction`'s doc comment to say the menu is macOS's (8.7). Delete `setPaperMenu` and `PaperMenuChoice`; in `noteRecentFile` and `onOpenFile`'s comments, *File › Open Recent* becomes *the Project menu's recent projects*.
- `fake.ts`: delete `paperMenu` / `setPaperMenu` and the `PaperMenuChoice` import.
- `packages/platform/src/index.ts`: drop `PaperMenuChoice`.
- `shared/ipc.ts`: delete `setPaperMenu`; `menuAction`'s comment says macOS's menu (8.7).
- `preload/index.ts`, `platformBridge.ts`: delete `setPaperMenu`.
- `platformHandlers.ts`: delete the `setPaperMenu` handler, the `onPaperChoices` parameter, the `validPaperChoices` and `PaperMenuChoice` imports. `onRecentChanged`'s comment: the operating system's recent list changed.
- `main/index.ts`:
  - delete `paperChoices`, the `PaperMenuChoice` import, and the `onPaperChoices` argument;
  - `buildMenu` becomes

```ts
/**
 * The application menu (8.7): none on Linux and Windows — the project bar
 * holds its actions — and the platform's minimal one on macOS. Built once.
 */
function buildMenu(): void {
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate(
          macMenuTemplate({ send: (action) => mainWindow?.webContents.send(IPC.menuAction, action) }),
        )
      : null,
  );
}
```

  - `openRecent` and the recent-changed callback stop calling `buildMenu()`; the callback keeps `app.addRecentDocument(path)`;
  - delete `app.setAboutPanelOptions(...)` — About is the renderer's dialog;
  - in `createWindow`, after `watchWindow(mainWindow)`:

```ts
  // The keys the native menu's roles used to give (8.7), now Linux and
  // Windows have no menu: full screen, Quit, and in development the tools.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = windowKeyFor(input, {
      isMac: process.platform === 'darwin',
      packaged: app.isPackaged,
    });
    if (key === null) return;
    event.preventDefault();
    if (key === 'full-screen') mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    // Through the window's close, so unsaved work is asked about (5.3a).
    else if (key === 'quit') app.quit();
    else mainWindow?.webContents.toggleDevTools();
  });
```

  - update the comments naming *File › Open Recent* and *Help › Third-Party Notices*.
- `App.tsx`:
  - delete the effect that sends `setPaperMenu`, and imports only it used (`paperOptionsFor`, `describeChoice`, `PAPER_NAMES`, `ORIENTATIONS`, `setPageSetup` — check each has no other use);
  - the `onMenuAction` effect becomes

```tsx
  // macOS's native menu (8.7) sends what the platform keeps there; each runs
  // the handler its key and its button run.
  useEffect(
    () =>
      getPlatformHost().onMenuAction((action) => {
        if (action === 'undo') store.undo();
        else if (action === 'redo') store.redo();
        else if (action === 'about') setAboutOpen(true);
        else setSettings('general');
      }),
    [store],
  );
```

  - comments naming *View › Zoom In*, *Help › Open Sample Project*, *File › Open Recent*: say what they are now (the zoom keys; Help's *Open sample project*; the Project menu's recent projects). Same in `CanvasHost.tsx` (lines ~85–87), `useProjectFile.ts` (~284), `main/preferences.ts` (line 8), `notices/thirdPartyNotices.ts` (line 16).
- `shortcuts.ts`: add to the *Window* group `{ keys: ['F11'], does: 'Full screen' }` and `{ keys: ['CmdOrCtrl+Q'], does: 'Quit' }`; its doc comment says the map is held to the React menus and macOS's menu by a test.

- [ ] **Step 5: Run the unit tests**

Run: `pnpm typecheck && pnpm vitest run apps/desktop/src packages/platform`
Expected: PASS.

- [ ] **Step 6: E2E**

`git mv e2e/menu.spec.ts e2e/window.spec.ts`, and replace its tests (keep `launch` and `drawAPanel`, delete `choose`):

```ts
/**
 * Slice 8.7: Linux and Windows have no application menu — the project bar
 * holds its actions — and the window answers the keys its roles used to give.
 */

test('there is no application menu off macOS (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'macOS keeps the platform’s own menu');
  const { app } = await launch();
  try {
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
  } finally {
    await closeApp(app);
  }
});

test('Ctrl+Q asks about unsaved work before it quits (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'the app menu quits on macOS');
  const { app, window } = await launch();
  try {
    await drawAPanel(window);
    await window.keyboard.press('Control+q');
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('F11 toggles full screen (8.7)', async () => {
  const { app, window } = await launch();
  try {
    const full = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
    await window.keyboard.press('F11');
    await expect.poll(full).toBe(true);
    await window.keyboard.press('F11');
    await expect.poll(full).toBe(false);
  } finally {
    await closeApp(app);
  }
});

test('copy and paste work in a text field with no menu (8.7)', async () => {
  // Chromium's own editing keys: nothing of the app's, and no menu role.
  const { app, window } = await launch();
  try {
    const name = window.getByTestId('project-name');
    await name.fill('Wallet');
    await name.press('ControlOrMeta+a');
    await name.press('ControlOrMeta+c');
    await name.press('End');
    await name.press('ControlOrMeta+v');
    await expect(name).toHaveValue('WalletWallet');
  } finally {
    await closeApp(app);
  }
});

test('the zoom keys zoom, and Ctrl+0 fits the pattern again (8.4b)', async () => {
  // Zoom changes which millimetre is under a fixed point off the centre, and
  // fitting brings it back. The menu that also zoomed is gone; the keys stay.
  const { app, window } = await launch();
  try {
    await drawAPanel(window);
    await window.getByTestId('tool-select').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const scale = async (): Promise<string> => {
      await window.mouse.move(board.x + 60, board.y + 60);
      await window.mouse.move(board.x + 61, board.y + 61);
      return (await window.getByTestId('cursor-readout').textContent()) ?? '';
    };
    await window.keyboard.press('Control+0');
    const fitted = await scale();
    await window.keyboard.press('Control+Equal');
    await expect.poll(scale).not.toBe(fitted);
    await window.keyboard.press('Control+0');
    await expect.poll(scale).toBe(fitted);
    await window.keyboard.press('Control+Minus');
    await expect.poll(scale).not.toBe(fitted);
  } finally {
    await closeApp(app);
  }
});
```

If Playwright's key presses do not reach `before-input-event` (the Ctrl+Q or F11 test sees nothing happen), say so in the test's place with `test.fixme(...)` and a comment naming why: the unit tests of `windowKeyFor` still hold the mapping. Check that before assuming it. Under Xvfb with no window manager, `isFullScreen` may not change; if the F11 test fails only for that reason, `test.skip` it on CI with that reason and check F11 by hand.

`e2e/sheets.spec.ts`, lines ~215–227: replace the two native *View* menu clicks with `window.getByTestId('view-design').click()` and `window.getByTestId('view-sheets').click()`, and their comments with "by the switch".

`e2e/packaged/packaged.spec.ts`: the menu test becomes

```ts
test('has no menu off macOS, and no Reload or developer tools anywhere (8.7)', async () => {
  const roles = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (menu === null) return null;
    const found: string[] = [];
    const walk = (items: Electron.MenuItem[]): void => {
      for (const entry of items) {
        found.push(String(entry.role ?? '').toLowerCase());
        if (entry.submenu) walk(entry.submenu.items);
      }
    };
    walk(menu.items);
    return found;
  });
  if (process.platform === 'darwin') {
    expect(roles).toContain('quit');
    for (const role of ['reload', 'forcereload', 'toggledevtools']) expect(roles).not.toContain(role);
  } else {
    expect(roles).toBeNull();
  }
  // The developer tools' keys do nothing in the shipped build.
  const window = await app.firstWindow();
  await window.keyboard.press('F12');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isDevToolsOpened())).toBe(false);
});
```

- [ ] **Step 7: Verify**

Run: `pnpm check` (typecheck, lint, format, depcruise, knip, coverage, perf), then `pnpm test:e2e`.
Expected: all pass. `knip` will name anything left exported and unused — delete it rather than ignore it.

Then `pnpm dev`: no menu bar; F11, Ctrl+Q with unsaved work, and — dev build — F12 all work.

- [ ] **Step 8: Commit**

```bash
git add -A apps/desktop packages/platform e2e
git commit -m "feat(desktop): no native menu on Linux and Windows, the minimal one on macOS

The project bar holds the project's actions, Settings and Help, each once.
The Paper menu, a copy of the sheet indicator, goes with its IPC.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Fit, accessibility, pictures and documents

**Files:**
- Modify: `e2e/top-bar.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/visual/__screenshots__/**`, `docs/images/*`, `docs/getting-started.md`, `docs/file-format.md`, `docs/architecture.md`, `README.md`, `docs/superpowers/specs/2026-09-24-sheets-workflow-design.md`, `docs/roadmap.md`

- [ ] **Step 1: The 860 px test**

Append to `e2e/top-bar.spec.ts`:

```ts
test('the project bar fits the smallest window, with the longest paper it says (8.7)', async () => {
  const { app, window } = await launch(mkdtempSync(join(tmpdir(), 'leathercad-e2e-fit-')));
  try {
    // The sample's paper reads '5 sheets of A4, portrait (Outer and Lining
    // taped)', and a changed name adds 'Unsaved changes': the widest the bar gets.
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-open-sample').click();
    await expect(window.getByTestId('project-name')).toHaveValue('Bifold wallet');
    await window.getByTestId('project-name').fill('Bifold wallet, lined');
    const tall = (await window.getByTestId('project-bar').boundingBox())!.height;

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(860, 600));
    await expect.poll(() => window.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(860);

    const bar = (await window.getByTestId('project-bar').boundingBox())!;
    expect(bar.height, 'nothing wrapped onto a second row').toBe(tall);
    for (const id of ['project-menu', 'project-name', 'save', 'paper', 'export-pdf', 'settings', 'help-menu']) {
      const box = (await window.getByTestId(id).boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(bar.x);
      expect(box.x + box.width, id).toBeLessThanOrEqual(bar.x + bar.width);
    }
  } finally {
    await closeApp(app);
  }
});
```

Run: `pnpm build && pnpm exec playwright test e2e/top-bar.spec.ts`
Expected: PASS. If it fails, the bar does not fit: fix the layout (the name field gives way first, per `.project-identity`'s existing rules), not the test.

- [ ] **Step 2: The accessibility scan**

Append to `e2e/accessibility.spec.ts`, following the second test's `AxeBuilder` call:

```ts
test('the top bar’s menus, Settings and About have no accessibility violations (8.7)', async () => {
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    const scan = async (what: string): Promise<void> => {
      const results = await new AxeBuilder({ page: window })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`), what).toEqual([]);
    };

    await window.getByTestId('project-menu').click();
    await scan('the Project menu, with no recent projects');
    await window.keyboard.press('Escape');
    await window.getByTestId('help-menu').click();
    await scan('the Help menu');
    await window.keyboard.press('Escape');

    await window.getByTestId('settings').click();
    for (const section of ['general', 'appearance', 'shortcuts']) {
      await window.getByTestId(`settings-tab-${section}`).click();
      await scan(`Settings › ${section}`);
    }
    await window.keyboard.press('Escape');

    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    await scan('About');
  } finally {
    await closeApp(instance);
  }
});
```

Run: `pnpm exec playwright test e2e/accessibility.spec.ts` — Expected: PASS. A violation is fixed in the markup, never added to `KNOWN`.

- [ ] **Step 3: Pictures**

Run: `pnpm build && pnpm test:visual --update-snapshots` (needs Docker), then look at **every** changed image under `e2e/visual/__screenshots__/` with an image viewer — only the project bar should differ. Then `pnpm docs:media` (needs a display) and look at `docs/images/design.png`, `sheets.png`, `print.png` and `demo.gif`.

- [ ] **Step 4: Documents**

- `docs/getting-started.md`: line ~36, *Help → Open Sample Project* → *Help (?) → Open sample project*; line ~98, *Help → Keyboard Shortcuts* → *Settings (⚙) › Keyboard shortcuts, or Ctrl+/*; line ~103, *File → Open Recent* → *the Project menu's recent projects*, and "The legend and the tool rail stay as you left them" gains "— both are in Settings › Appearance"; lines ~104–105, *Help → Show Log Folder* and *Help → Third-Party Notices* → *Help (?) → About LeatherCAD → Show log folder / Third-party notices*.
- `docs/file-format.md` line ~337: `File › Open Recent (8.2)` → `the Project menu's recent projects (8.2, 8.7)`.
- `README.md` line ~162: *Help → Third-Party Notices* → *Help → About LeatherCAD → Third-party notices*.
- `docs/architecture.md`: `grep -n -i menu docs/architecture.md`; say what 8.7 made true wherever it describes the application menu.
- `docs/superpowers/specs/2026-09-24-sheets-workflow-design.md` §4.1, after the *New and Open* bullet, add: `  *Superseded by 8.7:* New and Open live in the Project menu, and there is no File menu
  ([top bar and Settings](2026-09-29-top-bar-and-settings-design.md)).`
- `docs/roadmap.md`: 8.7 ◐ → ✅.

Run: `grep -rn -E "File ›|Help ›|View ›|Paper ›|Tools ›|File →|Help →|Keyboard Shortcuts" docs README.md apps/desktop/src --include='*.md' --include='*.ts' --include='*.tsx' | grep -v /history/` — Expected: nothing left but deliberate history.

- [ ] **Step 5: Verify the slice**

Run: `pnpm check && pnpm test:e2e`
Expected: all pass. Run `/arch-check`. Then `pnpm dev` once more and walk the whole thing: Project menu (mouse and keys), a recent project, Save as, Help, About and its two buttons, Settings in each section, `?` in the name field, Ctrl+, Ctrl+/ F11 Ctrl+Q.

- [ ] **Step 6: Commit**

```bash
git add -A e2e docs README.md
git commit -m "docs: the top bar and Settings, in the guides, the pictures and the roadmap (8.7)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then the pull request into `develop`, titled `feat(desktop): the top bar and Settings (8.7)` — squash-merged, so the title is the changelog line.
