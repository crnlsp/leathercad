import type { DocumentStore } from '@leathercad/document';
import { Viewport } from '@leathercad/editor';

import type { CanvasView } from './CanvasHost.js';

/** A project's file, as its tab last left it: where it is, and what went wrong with it. */
export interface ProjectFileState {
  readonly path: string | null;
  /**
   * What went wrong with the last save, open or export, as it was thrown: put
   * into words where it is shown (`fileErrorText`), so it follows a change of
   * language like everything else.
   */
  readonly error: unknown;
  readonly savedAt: string | null;
}

/**
 * The board's two cameras (7.4c), kept by the tab so a project comes back
 * exactly where it was left. The canvas is made again for each tab it shows,
 * and takes these rather than new ones.
 */
export interface TabCameras {
  readonly design: Viewport;
  readonly sheets: Viewport;
  /** The design camera has been placed once: a tab shown again is not re-placed. */
  fitted: boolean;
  /** Its first placing frames the drawing: an opened project is shown whole. */
  frameDrawing: boolean;
  /** The sheets' extent the Sheets camera was last fitted to: a new one frames again. */
  sheetsFramed: string | null;
}

/**
 * One open project (8.12): its document and history, its file, and how it was
 * being looked at. Nothing here is persisted, the view and the cameras least
 * of all — they are view state, like the tool.
 *
 * Its fields change only through `ProjectTabs`, which tells the window.
 */
export interface ProjectTab {
  readonly id: string;
  readonly store: DocumentStore;
  file: ProjectFileState;
  /**
   * The document last saved or opened. By identity: undoing back to it makes
   * the project clean again. Null for recovered work, which is unsaved by
   * construction.
   */
  savedDocument: unknown;
  /** When the file was first created, kept through each save. */
  createdUtc: string | undefined;
  view: CanvasView;
  readonly cameras: TabCameras;
}

/** A tab for `store`, which counts as saved as it is: an untouched project has nothing to lose. */
export function newTab(id: string, store: DocumentStore): ProjectTab {
  return {
    id,
    store,
    file: { path: null, error: null, savedAt: null },
    savedDocument: store.getState().document,
    createdUtc: undefined,
    view: 'design',
    cameras: {
      design: new Viewport(),
      sheets: new Viewport(),
      fitted: false,
      frameDrawing: false,
      sheetsFramed: null,
    },
  };
}

/**
 * What a tab is called (8.12): its project's name, or *Untitled* for one with
 * none. A project first saved without a name is named after its file, so
 * *Save as* names the tab, as in Notepad.
 */
export function tabName(tab: ProjectTab, untitled: string): string {
  const name = tab.store.getState().document.project.name.trim();
  return name === '' ? untitled : name;
}

/** Whether the project differs from what was last saved or opened. */
export function isDirty(tab: ProjectTab): boolean {
  return tab.savedDocument !== tab.store.getState().document;
}

/**
 * An *Untitled* nobody has touched (8.12): no file, nothing drawn, nothing to
 * undo. A project opened while it is the active tab takes its place, as in
 * Notepad, rather than leaving an empty tab behind.
 */
export function isPristine(tab: ProjectTab): boolean {
  const { document, canUndo, canRedo } = tab.store.getState();
  return (
    tab.file.path === null &&
    !isDirty(tab) &&
    !canUndo &&
    !canRedo &&
    document.project.parts.length === 0
  );
}

/**
 * Which tab is active once `closing` is closed: the one to its right, or, for
 * the last, the one to its left — where the eye already is. Closing a tab that
 * is not active leaves the active one. Null when none is left.
 */
export function activeAfterClose(
  ids: readonly string[],
  active: string,
  closing: string,
): string | null {
  const at = ids.indexOf(closing);
  if (at === -1) return active;
  const rest = ids.filter((id) => id !== closing);
  if (rest.length === 0) return null;
  if (closing !== active) return active;
  return rest[Math.min(at, rest.length - 1)]!;
}

/** The tab `step` places from `active`, round the ends: Ctrl+Tab and Ctrl+Shift+Tab. */
export function cycled(ids: readonly string[], active: string, step: 1 | -1): string {
  const at = ids.indexOf(active);
  if (at === -1 || ids.length === 0) return active;
  return ids[(at + step + ids.length) % ids.length]!;
}

/**
 * What the window reads: the tabs in order, and the active one — none when
 * every project is closed, and the window shows its start screen. A new
 * object on every change.
 */
export interface TabsSnapshot {
  readonly tabs: readonly ProjectTab[];
  readonly active: ProjectTab | null;
}

/**
 * The open projects, in their order, and which one the window shows (8.12).
 *
 * The app starts with one, an *Untitled*; closing the last leaves none, and
 * the app running, on its start screen. A plain store with `subscribe`, like
 * the document's, so React reads it through `useSyncExternalStore` and
 * nothing else holds the list.
 */
export class ProjectTabs {
  private snapshot: TabsSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(first: ProjectTab) {
    this.snapshot = { tabs: [first], active: first };
  }

  getSnapshot = (): TabsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get active(): ProjectTab | null {
    return this.snapshot.active;
  }

  get tabs(): readonly ProjectTab[] {
    return this.snapshot.tabs;
  }

  /** The tab holding the project saved at, or opened from, `path`. */
  byPath(path: string): ProjectTab | undefined {
    return this.snapshot.tabs.find((tab) => tab.file.path === path);
  }

  /**
   * Shows `tab`, the active one's replacement when that one is pristine, and
   * otherwise a new tab at the end.
   */
  open(tab: ProjectTab): void {
    const { tabs, active } = this.snapshot;
    const next =
      active !== null && isPristine(active)
        ? tabs.map((each) => (each === active ? tab : each))
        : [...tabs, tab];
    this.set(next, tab);
  }

  /**
   * Shows `tab` in a new tab at the end, whatever the active one holds: *New*
   * and *+* ask for a tab, so one is always added — replacing an untouched
   * *Untitled* with another looked like nothing happened.
   */
  add(tab: ProjectTab): void {
    this.set([...this.snapshot.tabs, tab], tab);
  }

  activate(id: string): void {
    const tab = this.snapshot.tabs.find((each) => each.id === id);
    if (tab !== undefined && tab !== this.snapshot.active) this.set(this.snapshot.tabs, tab);
  }

  cycle(step: 1 | -1): void {
    const { active } = this.snapshot;
    if (active !== null) this.activate(cycled(this.ids(), active.id, step));
  }

  /**
   * Closes a tab; the last leaves none. Whether its unsaved work may go is the
   * caller's to have asked.
   */
  close(id: string): void {
    const { tabs, active } = this.snapshot;
    if (active === null || !tabs.some((tab) => tab.id === id)) return;
    const next = activeAfterClose(this.ids(), active.id, id);
    const rest = tabs.filter((tab) => tab.id !== id);
    this.set(rest, rest.find((tab) => tab.id === next) ?? null);
  }

  /** Changes a tab's own fields, and tells the window. */
  update(id: string, change: (tab: ProjectTab) => void): void {
    const tab = this.snapshot.tabs.find((each) => each.id === id);
    if (tab === undefined) return;
    change(tab);
    this.set(this.snapshot.tabs, this.snapshot.active);
  }

  private ids(): string[] {
    return this.snapshot.tabs.map((tab) => tab.id);
  }

  private set(tabs: readonly ProjectTab[], active: ProjectTab | null): void {
    this.snapshot = { tabs, active };
    for (const listener of this.listeners) listener();
  }
}
