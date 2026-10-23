import { createIdFactory, formatMm, formatNumber } from '@leathercad/core';
import {
  DocumentStore,
  deleteFeatures,
  deletePart,
  deleteRefusal,
  drawnBounds,
  duplicatePart,
  emptyDocument,
  isEmptySelection,
  selectedFeatureIds,
  planDelete,
  setProjectName,
  type DeleteResolution,
  type Document,
} from '@leathercad/document';
import {
  badgesOf,
  countBySeverity,
  diagnose,
  diagnosticTarget,
  evaluate,
  type Diagnostic,
  type Project,
} from '@leathercad/domain';
import {
  systemIdSource,
  type Preferences,
  type RecentFile,
  type UpdateStatus,
} from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  DEFAULT_EDIT_POINTS,
  DEFAULT_HARDWARE,
  type DrawMode,
  type EditPointsOptions,
  type HardwareOptions,
} from '@leathercad/editor';

import { createI18n, resolveLocale, type Translate } from '../../shared/i18n.js';
import { AboutDialog } from './AboutDialog.js';
import { CanvasHost, type CanvasHandle, type CanvasStatus, type CanvasView } from './CanvasHost.js';
import { CanvasLegend } from './CanvasLegend.js';
import { selectionForRightClick, selectionMenu, type RightClicked } from './contextMenu.js';
import { DeleteDialog } from './DeleteDialog.js';
import { ContextMenu } from './Menu.js';
import { TextFieldMenu } from './TextFieldMenu.js';
import { ExportNotice } from './ExportNotice.js';
import { PrintPreview } from './PrintPreview.js';
import {
  fileErrorText,
  useProjectFile,
  type DrawingFormat,
  type ExportReport,
} from './useProjectFile.js';
import { ProjectBar, windowTitle } from './ProjectBar.js';
import { MessageDialog } from './MessageDialog.js';
import { NewTabMenu, ProjectMenu } from './ProjectMenu.js';
import { StartScreen } from './StartScreen.js';
import { ProjectTabs, isDirty, newTab, tabName, type ProjectTab } from './projectTabs.js';
import { TabContextMenu, TabStrip } from './TabStrip.js';
import { printStatusFor } from './sheets.js';
import { SheetsSummary } from './ViewSwitch.js';
import { PartsList } from './PartsList.js';
import { historyText } from './historyText.js';
import { describeProblem } from './problemText.js';
import { ProblemsPanel } from './ProblemsPanel.js';
import { PropertyPanel } from './PropertyPanel.js';
import { SheetsParts, SheetsProperties } from './SheetsPanels.js';
import { selectedParts } from './sheetContents.js';
import { ToolOptions } from './ToolOptions.js';
import { ToolPalette } from './ToolPalette.js';
import { UnsavedChangesDialog, type DiscardingAction } from './UnsavedChangesDialog.js';
import { VersionButton } from './VersionButton.js';
import { I18nProvider } from './i18n.js';
import { RecoveryDialog } from './RecoveryDialog.js';
import type { MakerTools } from './irons.js';
import { SettingsDialog, type SettingsSection } from './SettingsDialog.js';
import { IS_MAC } from './keyCaps.js';
import { applyBindings, commandFor, keysOf, matches, type CommandId } from './keymap.js';
import {
  CHIP_ICON,
  PanelChip,
  PanelToggle,
  PartsStrip,
  PropertiesStrip,
  type Press,
} from './PanelFold.js';
import { readBindings } from './rebind.js';
import { isTyping, pressesControl } from './shortcuts.js';
import { useRecovery } from './useRecovery.js';
import { getPlatformHost } from './platformBridge.js';
import { OptionHints } from './OptionHintsRow.js';
import { SHEETS_HINTS, hintsFor } from './optionHints.js';
import { chipSubject } from './outlineSizes.js';
import { ALL_TOOLS, DRAWING_TOOL_IDS } from './tools.js';
import { Tooltip } from './Tooltip.js';
import { useMediaQuery } from './useMediaQuery.js';
import { usePanelLayout } from './usePanelLayout.js';
import { ZoomControl, type ZoomCommand } from './ZoomControl.js';

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** What each zoom command asks of the canvas: its key and the zoom control run the same (U.4). */
const ZOOM: Readonly<Record<ZoomCommand, (canvas: CanvasHandle) => void>> = {
  zoomIn: (canvas) => canvas.step(1),
  zoomOut: (canvas) => canvas.step(-1),
  fit: (canvas) => canvas.fit(),
  fitSelection: (canvas) => canvas.fitSelection(),
  trueSize: (canvas) => canvas.zoomTo(100),
};

/**
 * The room the canvas legend opens with names in (U.10, R-09): at 1024 px wide
 * or narrower, or shorter than 720 px, it folds to its chip. The board is the
 * same either way — the legend floats over it.
 */
const LEGEND_ROOM = '(min-width: 1025px) and (min-height: 720px)';

export function App({
  initialPreferences,
  systemLanguages,
}: {
  /** Read before the first render, so the window opens in its own language. */
  initialPreferences: Preferences;
  /** The operating system's languages, most preferred first: what *Follow system* follows. */
  systemLanguages: readonly string[];
}) {
  const [version, setVersion] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [toolId, setToolId] = useState<string>('rectangle');

  // The open projects (8.12): one tab each, and the one the window shows.
  // Every document, its history and its file are a tab's; the window holds
  // the list, and the chrome below shows the active tab.
  const nextId = useMemo(() => createIdFactory(systemIdSource), []);
  // Without a name: shown as *Untitled* in the interface's words, and named
  // after its file when first saved (8.12).
  const blank = useCallback(() => emptyDocument(nextId(), ''), [nextId]);
  const tabFor = useCallback(
    (opened: Document, untitled = 0): ProjectTab =>
      newTab(nextId(), new DocumentStore(opened), untitled),
    [nextId],
  );
  // None at first: the start screen, unless the last session's tabs come back.
  const tabs = useMemo(() => new ProjectTabs(), []);
  const { tabs: openTabs, active } = useSyncExternalStore(tabs.subscribe, tabs.getSnapshot);
  // With every project closed the window shows its start screen (8.12), and
  // the chrome below is not shown. Its hooks still run, in their order, over
  // an empty project of their own that is never shown, saved or written to
  // recovery; the window's keys leave it alone.
  const idle = useMemo(() => tabFor(blank()), [tabFor, blank]);
  const tab = active ?? idle;
  const store = tab.store;

  // Design or Sheets (7.4c), the tab's own. View state, like the tool: never saved.
  const view = tab.view;
  /**
   * A part under the pointer — on a sheet, or on its Parts row — so the other
   * side can show it too (7.4d). View state, never saved.
   */
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  /** The tool the board had when the maker went to the sheets, to give back. */
  const designToolRef = useRef<string>('rectangle');

  /** Shows the active tab on Design or Sheets. */
  const showView = useCallback(
    (next: CanvasView) => {
      const shown = tabs.active;
      if (shown === null || shown.view === next) return;
      tabs.update(shown.id, (each) => {
        each.view = next;
      });
    },
    [tabs],
  );

  /**
   * Going to the sheets leaves the drawing tools behind — nothing is drawn on
   * paper — and coming back gives the board its tool again. Whatever changed
   * the view: the switch, a key, a problem gone to, or another tab (8.12).
   */
  const toolsView = useRef<CanvasView>(view);
  useEffect(() => {
    if (toolsView.current === view) return;
    toolsView.current = view;
    if (view === 'sheets') {
      setToolId((current) => {
        designToolRef.current = current;
        return 'select';
      });
    } else {
      setToolId(designToolRef.current);
    }
  }, [view]);

  // A view's own controls go with it — Design's tools, its Properties. A
  // maker on the keys whose focus was on one lands on the board, not on
  // nothing, which sent the next Tab back to the top of the window (U.19).
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      document.querySelector<HTMLElement>('[data-testid="editor-canvas"]')?.focus();
    }
  }, [view]);

  /**
   * Choosing a tool. On the Sheets view, any tool but Select means going back
   * to the board with it: tools act on the design, never on the paper.
   */
  const chooseTool = useCallback(
    (id: string) => {
      if (tabs.active?.view === 'sheets' && id !== 'select') {
        // The board takes this tool back when the view changes.
        designToolRef.current = id;
        showView('design');
      }
      setToolId(id);
    },
    [showView, tabs],
  );
  // What a drawn line becomes, and what the hardware tool punches. Owned
  // here because both outlive the tool they configure: switching to the arc
  // tool and back must not silently put the user back on 'Cut'.
  const [drawAs, setDrawAs] = useState<DrawMode>('outline');
  const [hardware, setHardware] = useState<HardwareOptions>(DEFAULT_HARDWARE);
  const [pointOptions, setPointOptions] = useState<EditPointsOptions>(DEFAULT_EDIT_POINTS);

  // The frame's own state (UI Foundations §7.1–7.2). None of it is the
  // document's, and none of it is persisted with it.
  //
  // How the maker likes the frame, kept in preferences.json (8.2) — not
  // localStorage, which a second window blocks on for seconds because both
  // share one profile. Read before the first render (main.tsx).
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
  const changePreferences = useCallback((asked: Partial<Preferences>) => {
    // The maker's keys are heard, and every cap shows them, from this press on
    // (U.12) — read as the main process reads them, so both hear the same keys.
    const keyBindings =
      asked.keyBindings === undefined ? undefined : readBindings(asked.keyBindings, IS_MAC);
    const changes = keyBindings === undefined ? asked : { ...asked, keyBindings };
    if (keyBindings !== undefined) applyBindings(keyBindings);
    setPreferences((previous) => ({ ...previous, ...changes }));
    // A preference that could not be kept still applies to this session.
    void getPlatformHost()
      .setPreferences(changes)
      .catch(() => undefined);
  }, []);

  // The maker's irons and starting values (U.13, Settings › My tools): what
  // the panel's Iron menu lists and what the app makes new things with.
  const tools = useMemo<MakerTools>(
    () => ({
      irons: preferences.irons,
      defaultIronId: preferences.defaultIronId,
      stitchMarginMm: preferences.stitchMarginMm,
      leatherThicknessMm: preferences.leatherThicknessMm,
    }),
    [
      preferences.irons,
      preferences.defaultIronId,
      preferences.stitchMarginMm,
      preferences.leatherThicknessMm,
    ],
  );
  // The bar under the selected piece (U.17), unless Settings › Appearance turned it off.
  const selectionBarOn = preferences.selectionBar;
  const makerDefaults = useMemo(
    () => ({
      stitchMarginMm: tools.stitchMarginMm,
      leatherThicknessMm: tools.leatherThicknessMm,
    }),
    [tools.stitchMarginMm, tools.leatherThicknessMm],
  );

  // The interface's language (ADR 0018): a preference like any other, so a
  // change in Settings re-renders every word at once. The document's `lang`
  // follows, for the screen reader's voice and the browser's hyphenation.
  const i18n = useMemo(
    () => createI18n(resolveLocale(preferences.language, systemLanguages)),
    [preferences.language, systemLanguages],
  );
  const { t } = i18n;
  useEffect(() => {
    document.documentElement.lang = i18n.locale;
  }, [i18n]);

  // The frame's room, the maker's folds, focus mode and a panel opened over
  // the board (U.5, R-04).
  const {
    room,
    layout,
    focus,
    setFocus,
    toggleRail,
    open,
    closeOverlay,
    togglePanel,
    overlayKeys,
  } = usePanelLayout(preferences, changePreferences);
  // The canvas legend opens with names on a window with room for it (U.10,
  // R-09); at 1024 px wide or less, or under 720 px tall, it folds to its chip
  // for the session. That fold answers the window, not a liking, so it never
  // reaches preferences.json — and opening the legend by hand clears it.
  const legendHasRoom = useMediaQuery(LEGEND_ROOM);
  const [legendOpenedInSmallWindow, setLegendOpenedInSmallWindow] = useState(false);
  const legendOpen = preferences.legendOpen && (legendHasRoom || legendOpenedInSmallWindow);
  const toggleLegend = useCallback(() => {
    const next = !legendOpen;
    setLegendOpenedInSmallWindow(next);
    changePreferences({ legendOpen: next });
  }, [legendOpen, changePreferences]);
  // Settings (8.7), open on a section, or closed.
  const [settings, setSettings] = useState<SettingsSection | null>(null);

  const [problemsOpen, setProblemsOpen] = useState(false);
  // Print's second half opens the drawer (R-06); from the keyboard, focus
  // goes to the drawer's handle, where the list begins.
  const showProblems = useCallback((press: Press) => {
    setProblemsOpen(true);
    if (press === 'keyboard') {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[data-testid="problems-toggle"]')?.focus(),
      );
    }
  }, []);
  // The Help menu's button: F1 opens it (U.7).
  const helpRef = useRef<HTMLButtonElement>(null);

  // The canvas owns the viewport; this is the only handle on it. Anyone may
  // ask it to show a rectangle, zoom about its centre, or fit the pattern.
  const canvasRef = useRef<CanvasHandle>(null);
  const runZoom = useCallback((command: ZoomCommand) => {
    if (canvasRef.current !== null) ZOOM[command](canvasRef.current);
  }, []);
  const zoomTo = useCallback((percent: number) => canvasRef.current?.zoomTo(percent), []);

  // Mirror the active tab's store into React state so the chrome re-renders.
  // The canvas does not go through this path — it repaints from its own loop.
  // Another tab's store is read as the window renders it, React's pattern for
  // state that follows a prop: no pass showing the last tab's document.
  const [mirror, setMirror] = useState(() => ({ store, state: store.getState() }));
  if (mirror.store !== store) setMirror({ store, state: store.getState() });
  const storeState = mirror.store === store ? mirror.state : store.getState();
  useEffect(() => store.subscribe(() => setMirror({ store, state: store.getState() })), [store]);

  // What went wrong opening a project from the start screen, where no tab is
  // there to say it (8.12).
  const [startError, setStartError] = useState<unknown>(null);
  const file = useProjectFile(
    tabs,
    getPlatformHost,
    version ?? '0.0.0',
    tabFor,
    blank,
    t,
    setStartError,
  );
  // Read from the tab, which the store's mirror re-renders for.
  const dirty = isDirty(tab);
  const anyDirty = openTabs.some(isDirty);

  // The window says which project it shows, and whether it has unsaved work
  // (F.8): the taskbar and the window switcher read this title.
  // With none open, the product's name alone.
  const hasProject = active !== null;
  const shownName = tabName(tab, t);
  useEffect(() => {
    document.title = hasProject ? windowTitle(shownName, dirty, t) : 'LeatherCAD';
  }, [hasProject, shownName, dirty, t]);
  // And macOS's dot in the close button (U.7): the window's edited flag, lit
  // while any of its projects has unsaved work (8.12).
  useEffect(() => {
    void getPlatformHost()
      .setDocumentEdited(anyDirty)
      .catch(() => undefined);
  }, [anyDirty]);

  // Crash recovery (5.3b): a copy while there is unsaved work, and an offer of
  // what a crash left behind.
  const recovery = useRecovery({
    tabs,
    openTabs,
    revision: storeState.document,
    host: getPlatformHost,
    appVersion: version ?? '0.0.0',
    adoptRecovered: file.adoptRecovered,
  });

  // Never lose work silently (5.3a): closing a project's tab, or the window,
  // asks first about each project with unsaved work, with one question and
  // one answer. Resolves true when the action may go ahead. Opening a project
  // and starting one replace nothing since 8.12 — each has a tab — so they ask
  // nothing.
  const [pendingDiscard, setPendingDiscard] = useState<{
    action: DiscardingAction;
    tab: ProjectTab;
    resolve: (proceed: boolean) => void;
  } | null>(null);
  const discarding = useRef(false);
  const confirmDiscard = useCallback(
    (action: DiscardingAction, about: ProjectTab): Promise<boolean> => {
      if (!isDirty(about)) return Promise.resolve(true);
      // One question at a time: a second close while it is on screen is
      // answered by the first.
      if (discarding.current) return Promise.resolve(false);
      discarding.current = true;
      // The question is about the project in view.
      tabs.activate(about.id);
      return new Promise((resolve) =>
        setPendingDiscard({
          action,
          tab: about,
          resolve: (proceed) => {
            discarding.current = false;
            setPendingDiscard(null);
            resolve(proceed);
          },
        }),
      );
    },
    [tabs],
  );

  /** Closes a project's tab, once its unsaved work is saved or let go. */
  const closeTab = useCallback(
    async (id: string) => {
      const closing = tabs.tabs.find((each) => each.id === id);
      if (closing === undefined) return;
      if (await confirmDiscard('close', closing)) tabs.close(id);
    },
    [confirmDiscard, tabs],
  );

  /**
   * Asks about every project with unsaved work, one after another, as the
   * window closes (8.12). False as soon as one answer is *Cancel*.
   */
  const confirmDiscardAll = useCallback(async (): Promise<boolean> => {
    for (const each of tabs.tabs) {
      if (!(await confirmDiscard('close', each))) return false;
    }
    return true;
  }, [confirmDiscard, tabs]);

  const newProject = file.newProject;
  const openProject = file.open;
  // Help's *Open sample project* (8.3, 8.7), and the empty Parts panel's offer of it.
  const openSample = file.openSample;

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

  // The Project menu (8.7), at the tab strip's left since 8.12, and *Rename…*,
  // which turns the active tab's name into a field. One edit, one undo step.
  const projectMenuRef = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState<Press | null>(null);
  // Something the maker must read about a project's file (8.12): why a rename
  // was refused — its new name is taken, or no file can have it — or why a
  // file could not go to the Trash.
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const setRenameRefusal = useCallback(
    (text: string) => setNotice({ title: t('rename.title'), text }),
    [t],
  );
  // A tab's own menu (8.12), open at a point, and the tab whose file is being
  // asked about before it goes to the Trash.
  const [tabMenuAt, setTabMenuAt] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuTab =
    tabMenuAt === null ? undefined : openTabs.find((each) => each.id === tabMenuAt.id);
  const [trashing, setTrashing] = useState<ProjectTab | null>(null);

  const renamed = useCallback(
    (next: string | null) => {
      const named = tabs.active;
      const back = renaming === 'keyboard';
      setRenaming(null);
      if (back) requestAnimationFrame(() => projectMenuRef.current?.focus());
      if (named === null || next === null) return;
      if (next.trim() === named.store.getState().document.project.name.trim()) return;
      void (async () => {
        // A project with a file renames its file too (8.12) — never over
        // another: then nothing is renamed, and the maker is told why. A
        // name cleared leaves the file as it is; the tab shows its name.
        const path = named.file.path;
        if (path !== null && next.trim() !== '') {
          try {
            const outcome = await getPlatformHost().renameProjectFile(path, next);
            if (outcome.kind === 'exists') {
              setRenameRefusal(t('rename.exists', { file: outcome.file }));
              return;
            }
            if (outcome.kind === 'invalid') {
              setRenameRefusal(t('rename.invalid', { name: next.trim() }));
              return;
            }
            tabs.update(named.id, (each) => {
              each.file = { ...each.file, path: outcome.path };
            });
          } catch (error) {
            setRenameRefusal(t('rename.failed', { reason: fileErrorText(error, t) }));
            return;
          }
        }
        named.store.dispatch(setProjectName(next.trim()));
      })();
    },
    [renaming, setRenameRefusal, t, tabs],
  );
  // General says how many are listed, so it asks as Settings opens.
  useEffect(() => {
    if (settings !== null) refreshRecent();
  }, [settings, refreshRecent]);

  // The start (8.12): the tabs open when the app last closed, in their order,
  // the one that was showing in front — then a project double-clicked in the
  // file manager (8.5), in front of them. Asked for once the app is ready to
  // open them; the main process hands each over once, so a second run of this
  // effect (React's development double run) waits on the first.
  // `openPath` is stable.
  const openPath = file.openPath;
  const starting = useRef<Promise<void> | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    starting.current ??= (async () => {
      const host = getPlatformHost();
      try {
        const session = await host.takeSession();
        for (const path of session.projects) await openPath(path);
        const shown = session.active === null ? undefined : tabs.byPath(session.active);
        if (shown !== undefined) tabs.activate(shown.id);
      } catch {
        // A start without its tabs is better than a start that fails over them.
      }
      try {
        const path = await host.takeLaunchFile();
        if (path !== null) await openPath(path);
      } catch {
        // As above: the window opens all the same.
      }
    })();
    void starting.current.then(() => setStarted(true));
  }, [openPath, tabs]);

  // The open tabs, kept for the next start (8.12): those with a file, in the
  // strip's order, and the one in front. Not before the start has opened the
  // last ones, or its empty *Untitled* would be kept over them.
  const session = JSON.stringify([
    openTabs.flatMap((each) => (each.file.path === null ? [] : [each.file.path])),
    active?.file.path ?? null,
  ]);
  useEffect(() => {
    if (!started) return;
    const [projects, shown] = JSON.parse(session) as [string[], string | null];
    void getPlatformHost()
      .keepSession(projects, shown)
      .catch(() => undefined);
  }, [started, session]);

  // A recent project (8.2, 8.7), a second launch's (8.11), macOS's open-file:
  // the main process chose and granted the path, and it opens in a tab.
  useEffect(() => getPlatformHost().onOpenFile((path) => void openPath(path)), [openPath]);

  // The window's close button, Ctrl+Q and a reload all unload the page. With
  // unsaved work the unload is refused — Electron then keeps the window — and
  // the question is asked instead. An answer that lets it go closes the window
  // again, past this guard.
  const closing = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (closing.current || !tabs.tabs.some(isDirty)) return;
      event.preventDefault();
      event.returnValue = false;
      void confirmDiscardAll().then((proceed) => {
        if (!proceed) return;
        closing.current = true;
        window.close();
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [confirmDiscardAll, tabs]);

  // Whether a newer release exists (8.9): asked only when the maker presses
  // *Check now* in Settings or the version in the status bar. The main
  // process keeps the last answer, so a new window on macOS still shows it.
  const [updates, setUpdates] = useState<UpdateStatus>({ state: 'idle' });
  useEffect(() => {
    void getPlatformHost()
      .getUpdateStatus()
      .then(setUpdates)
      .catch(() => undefined);
  }, []);
  const checkUpdates = useCallback(
    () =>
      getPlatformHost()
        .checkForUpdates()
        .then(setUpdates)
        .catch(() => setUpdates({ state: 'failed' })),
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        setVersion(await getPlatformHost().getAppVersion());
      } catch (error) {
        setBridgeError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  // What the last export left the maker to check, until they close it. Null
  // when there was nothing to say, which is the common case.
  const [exportNotice, setExportNotice] = useState<ExportReport | null>(null);

  const exportPdf = useCallback(async () => {
    setExportNotice(await file.exportPdfFile());
  }, [file]);

  // The same for an SVG or a DXF, from the menu beside Export PDF (6.2, 6.5).
  const exportDrawing = useCallback(
    async (format: DrawingFormat) => {
      setExportNotice(await file.exportDrawingFile(format));
    },
    [file],
  );

  // The Print Preview (7.6), open or not.
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    // Through the keymap (U.3): each key by where it is on the keyboard, a
    // letter by the letter it types.
    const actions: Partial<Record<CommandId, () => void>> = {
      save: () => (tabs.active === null ? undefined : void file.save(tabs.active)),
      saveAs: () => (tabs.active === null ? undefined : void file.save(tabs.active, true)),
      openProject: () => void openProject(),
      newProject: () => void newProject(),
      exportPdf: () => void exportPdf(),
      print: () => setPrinting(true),
      // The project tabs (8.12).
      nextTab: () => tabs.cycle(1),
      previousTab: () => tabs.cycle(-1),
      closeTab: () => (tabs.active === null ? undefined : void closeTab(tabs.active.id)),
      design: () => showView('design'),
      sheets: () => showView('sheets'),
      // The shortcut map (8.2), where many apps keep it: in Settings (8.7).
      keyboardShortcuts: () => setSettings('shortcuts'),
      settings: () => setSettings('general'),
      help: () => helpRef.current?.click(),
      // The view (8.4b, U.4): zoom in and out, fit, and true size.
      zoomIn: () => runZoom('zoomIn'),
      zoomOut: () => runZoom('zoomOut'),
      fit: () => runZoom('fit'),
      fitSelection: () => runZoom('fitSelection'),
      trueSize: () => runZoom('trueSize'),
      // The panels (U.5): `[`, `]`, and `\` for focus mode.
      toggleParts: () => togglePanel('parts', 'keyboard'),
      toggleProperties: () => togglePanel('properties', 'keyboard'),
      focusMode: () => setFocus((on) => !on),
      // F6 (U.17): into the bar under the selected piece, and out again. Off
      // in Settings, there is no bar and no key.
      ...(selectionBarOn ? { selectionBar: () => canvasRef.current?.toggleSelectionBar() } : {}),
    };
    const onKey = (event: KeyboardEvent): void => {
      // A field's keys are its own, and so is a focused button's Space (U.12).
      if (isTyping(event.target) || pressesControl(event)) return;
      // Esc, once nothing before it claimed it — a menu, a field, a dialog,
      // the overlay it was pressed in, or a tool giving something up: an
      // overlay closes, then focus mode ends.
      if (keysOf('cancel').some((binding) => matches(event, binding, IS_MAC))) {
        if (event.defaultPrevented) return;
        if (open !== null) closeOverlay('keyboard');
        else if (focus) setFocus(false);
        else return;
        event.preventDefault();
        return;
      }
      const command = commandFor(event, IS_MAC);
      if (command === null) return;
      // On the start screen only the keys that need no project (8.12).
      if (tabs.active === null && !WITHOUT_PROJECT.has(command)) return;
      // A key something before the window claimed is not also a shortcut: the
      // active tool's (the polyline's A mid-run), a Parts row's, a menu's or a
      // tab list's arrows — whichever command the maker gave that key (U.12).
      if (event.defaultPrevented) return;
      if (command.startsWith('tool.')) {
        // Taken, so a tool moved to Ctrl+A is not Chromium's select-all too.
        event.preventDefault();
        chooseTool(command.slice('tool.'.length));
        return;
      }
      const action = actions[command];
      if (action === undefined) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    file,
    tabs,
    closeTab,
    exportPdf,
    newProject,
    openProject,
    showView,
    chooseTool,
    runZoom,
    togglePanel,
    open,
    focus,
    setFocus,
    closeOverlay,
    selectionBarOn,
  ]);

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

  const handleStatus = useCallback((next: CanvasStatus) => setStatus(next), []);

  /**
   * Going to a problem: **select the subject, frame the evidence.**
   *
   * The two differ whenever a feature failed to build — its diagnostic points
   * at what it was built *from*, because that is the geometry that exists and
   * the thing to edit — and the selection still follows what the row says the
   * problem is about, so clicking the same row twice selects the same feature.
   */
  const goToDiagnostic = useCallback(
    (diagnostic: Diagnostic) => {
      const project = store.getState().document.project;
      const target = diagnosticTarget(evaluate(project), diagnostic);

      if (target.subject.kind === 'feature') store.select([target.subject.featureId]);
      else store.selectParts([target.subject.partId]);

      // A problem is in the design: show it on the board.
      showView('design');
      if (target.bounds !== null) canvasRef.current?.frame(target.bounds);
    },
    [store, showView],
  );

  // A delete waiting on a decision about what follows it (ADR 0009). Null when
  // no dialog is open.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  /**
   * The one way anything asks to delete features: the panel's button and the
   * Delete key both come here. At once when nothing depends on them; otherwise
   * the dialog asks.
   */
  const requestDelete = useCallback(
    (ids: readonly string[]) => {
      const project = store.getState().document.project;
      const plan = planDelete(project, ids);
      if (plan.requested.length === 0) return;
      // Over the cascade, not only the request, and *before* the dialog: a
      // question about a delete that was never going to happen is worse than
      // no question. The command refuses it too — this is what keeps the user
      // from being asked (S7).
      if (deleteRefusal(project, ids) !== null) return;
      if (plan.dependents.length === 0) {
        store.dispatch(deleteFeatures(ids));
        store.clearSelection();
        return;
      }
      setPendingDelete({ ids });
    },
    [store],
  );

  const requestDeletePart = useCallback(
    (partId: string) => {
      const part = store.getState().document.project.parts.find((p) => p.id === partId);
      if (part === undefined) return;
      const ids = part.features.map((f) => f.id);
      const project = store.getState().document.project;
      if (deleteRefusal(project, ids) !== null) return;
      const plan = planDelete(project, ids);
      if (plan.dependents.length === 0) {
        store.dispatch(deletePart(partId));
        store.clearSelection();
        return;
      }
      setPendingDelete({ ids, partId });
    },
    [store],
  );

  const requestDuplicatePart = useCallback(
    (partId: string) => {
      const part = store.getState().document.project.parts.find((p) => p.id === partId);
      if (part === undefined) return;

      // The command takes the ids rather than making them, so it stays a pure
      // description of an edit: one per feature, in document order.
      const newPartId = nextId();
      const featureIds = part.features.map(() => nextId());
      store.dispatch(duplicatePart(partId, newPartId, featureIds));
      // The copy is what you are now working on.
      store.selectParts([newPartId]);
    },
    [store, nextId],
  );

  /**
   * The right-click menu (8.8), open at a point, or closed. One for the board
   * and the Parts list: both right-clicks come here.
   */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const openContextMenu = useCallback(
    (clicked: RightClicked, at: { x: number; y: number }) => {
      store.setSelection(selectionForRightClick(store.getState().selection, clicked));
      setContextMenu(at);
    },
    [store],
  );

  // What was under way on one tab is not the next one's (8.12): reset as the
  // window renders the next, like the store's mirror.
  const [shownTab, setShownTab] = useState(tab);
  if (shownTab !== tab) {
    setShownTab(tab);
    setHoveredPart(null);
    setContextMenu(null);
    setPendingDelete(null);
    setStatus(null);
  }

  // The Menu key and Shift+F10 (8.8). A Parts row answers for itself; from
  // anywhere else — the tool just chosen has focus, and the canvas cannot —
  // the menu is about the selection, opened where it is on the board. A
  // keyboard's menu comes with no button (-1); a right-click with the mouse
  // somewhere that has no menu of its own opens nothing.
  useEffect(() => {
    const onKeyboardMenu = (event: MouseEvent): void => {
      if (event.button !== -1 || event.defaultPrevented || isTyping(event.target)) return;
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"]')) {
        return;
      }
      if (isEmptySelection(store.getState().selection)) return;
      const at = canvasRef.current?.selectionPoint() ?? null;
      if (at === null) return;
      event.preventDefault();
      setContextMenu(at);
    };
    window.addEventListener('contextmenu', onKeyboardMenu);
    return () => window.removeEventListener('contextmenu', onKeyboardMenu);
  }, [store]);

  const resolvePendingDelete = (resolution: DeleteResolution): void => {
    if (pendingDelete === null) return;
    store.dispatch(
      pendingDelete.partId === undefined
        ? deleteFeatures(pendingDelete.ids, resolution)
        : deletePart(pendingDelete.partId, resolution),
    );
    store.clearSelection();
    setPendingDelete(null);
  };

  // One list, read by the panel, the count, the property panel and the canvas
  // (X7). Memoised on the project object inside `diagnose`, so asking here and
  // again in the canvas costs one evaluation.
  const diagnostics = diagnose(storeState.document.project);

  // The same list again, folded into counts. One pass, and the panel, the
  // parts tree and the feature rows all read this rather than counting their
  // own way to a different number.
  const badges = badgesOf(diagnostics);
  // And by severity, once, for Print's indicator and the drawer (U.7).
  const counts = countBySeverity(diagnostics);

  // Fit selection frames what the board draws of the selection, on Design: it
  // says why when it cannot (U.4). `evaluate` is memoised on the project.
  const selectionDrawn = useMemo(() => {
    const { project } = storeState.document;
    return (
      drawnBounds(evaluate(project), new Set(selectedFeatureIds(project, storeState.selection))) !==
      null
    );
  }, [storeState.document, storeState.selection]);
  const fitSelectionRefusal =
    view === 'sheets'
      ? t('zoom.onDesignOnly')
      : selectionDrawn
        ? undefined
        : t('zoom.nothingSelected');

  // The work bar's hints (U.11): the active tool's, for what is selected and whether a
  // shape is between its clicks.
  const toolHints = useMemo(
    () =>
      hintsFor({
        tool: ALL_TOOLS.find((entry) => entry.id === toolId)?.id ?? 'select',
        selected: !isEmptySelection(storeState.selection),
        sizable: chipSubject(storeState.document.project, storeState.selection) !== null,
        underway: status?.underway ?? false,
      }),
    [toolId, storeState.selection, storeState.document, status?.underway],
  );

  // The pieces the Sheets view's panels show as picked (U.9): the board's selection.
  const sheetsSelected = useMemo(
    () => selectedParts(storeState.document.project, storeState.selection),
    [storeState.document, storeState.selection],
  );

  const featureCount = storeState.document.project.parts.reduce(
    (total, part) => total + part.features.length,
    0,
  );

  return (
    <I18nProvider value={i18n}>
      <div className={hasProject ? 'app' : 'app no-project'}>
        <TabStrip
          tabs={openTabs}
          active={active}
          menu={
            <ProjectMenu
              hasProject={hasProject}
              recent={recent}
              triggerRef={projectMenuRef}
              onMenuOpen={refreshRecent}
              onNew={newProject}
              onOpen={() => void openProject()}
              onSaveAs={() => (active === null ? undefined : void file.save(active, true))}
              onRename={setRenaming}
              // The main process checks it is on the list, grants it, and
              // hands it back through onOpenFile, which opens it in a tab.
              onOpenRecent={(path) => getPlatformHost().openRecent(path)}
            />
          }
          add={
            <NewTabMenu
              recent={recent}
              onMenuOpen={refreshRecent}
              onNew={newProject}
              onOpen={() => void openProject()}
              onOpenRecent={(path) => getPlatformHost().openRecent(path)}
            />
          }
          nudged={tabs.nudged}
          renaming={renaming !== null}
          onRenamed={renamed}
          onActivate={(id) => tabs.activate(id)}
          onClose={(id) => void closeTab(id)}
          onTabMenu={(id, at) => setTabMenuAt({ id, ...at })}
        />
        {/* Not before the start has opened the last session's tabs: the start
            screen would show for a moment before them. */}
        {active === null ? (
          !started ? null : (
            <StartScreen
              recent={recent}
              onRefreshRecent={refreshRecent}
              error={startError === null ? null : fileErrorText(startError, t)}
              onNew={newProject}
              onOpen={() => void openProject()}
              onOpenSample={() => void openSample()}
              onOpenRecent={(path) =>
                void getPlatformHost()
                  .openRecent(path)
                  .then(refreshRecent)
                  .catch(() => undefined)
              }
            />
          )
        ) : (
          <>
            <ProjectBar
              project={storeState.document.project}
              store={store}
              dirty={dirty}
              saved={tab.file.path !== null}
              room={room}
              view={view}
              onView={showView}
              counts={counts}
              settled={!store.inTransaction}
              onShowProblems={showProblems}
              helpRef={helpRef}
              onOpenSample={() => void openSample()}
              onAbout={() => setAboutOpen(true)}
              // The mark is news about Updates, so the button opens there while it shows.
              onSettings={() => setSettings(updates.state === 'available' ? 'updates' : 'general')}
              updateAvailable={updates.state === 'available'}
              onSave={() => void file.save(tab)}
              onExport={() => void exportPdf()}
              onExportSvg={() => void exportDrawing('svg')}
              onExportDxf={() => void exportDrawing('dxf')}
              onPrint={() => setPrinting(true)}
            />

            {/* The work bar (F.8): what the maker is doing right now — history, the
          active tool's options and its hints (U.11). The project and
          its output are the bar above's; nothing here is about files. */}
            <div
              className="work-bar"
              data-testid="work-bar"
              role="region"
              aria-label={t('work.region')}
            >
              <div className="toolbar history" data-testid="history-group">
                {/* Names what it will undo. Disabled needs no reason beyond its own
              label: there is nothing to undo. */}
                <Tooltip
                  text={
                    storeState.undoLabel === null
                      ? null
                      : t('work.undoTooltip', { action: historyText(storeState.undoLabel, t) })
                  }
                  keys="undo"
                >
                  <button
                    type="button"
                    className="tool"
                    data-testid="undo"
                    disabled={!storeState.canUndo}
                    onClick={() => store.undo()}
                  >
                    {t('work.undo')}
                  </button>
                </Tooltip>
                <Tooltip
                  text={
                    storeState.redoLabel === null
                      ? null
                      : t('work.redoTooltip', { action: historyText(storeState.redoLabel, t) })
                  }
                  keys="redo"
                >
                  <button
                    type="button"
                    className="tool"
                    data-testid="redo"
                    disabled={!storeState.canRedo}
                    onClick={() => store.redo()}
                  >
                    {t('work.redo')}
                  </button>
                </Tooltip>
              </div>
              {view === 'design' ? (
                <>
                  <ToolOptions
                    toolId={toolId}
                    drawAs={drawAs}
                    onDrawAs={setDrawAs}
                    hardware={hardware}
                    onHardware={setHardware}
                    points={pointOptions}
                    onPoints={setPointOptions}
                  />
                  {/* What the active tool does with a click, a drag and a key, true for that
                tool and no other (F.1), and for the state it is in (U.11). The lowest
                ranked give way as the bar narrows, whole; "all keys" never does. */}
                  <OptionHints hints={toolHints} testId="tool-how-to" />
                </>
              ) : (
                <>
                  <OptionHints hints={SHEETS_HINTS} testId="sheets-hint" />
                  {/* The plan in words, for a screen reader: the sheet count, what is taped and
                  what is left off now sit in Parts and Properties. */}
                  <SheetsSummary project={storeState.document.project} />
                </>
              )}
            </div>

            <div
              className={[
                'workspace',
                layout.railNames ? '' : 'rail-collapsed',
                room === 'wide' ? '' : 'narrow',
                `parts-${layout.parts}`,
                `properties-${layout.properties}`,
                open === null ? '' : `${open}-open`,
              ]
                .filter((name) => name !== '')
                .join(' ')}
              // The room the frame is laid out for. It follows the window a frame
              // late — media queries are evaluated as the window next renders — so
              // a test waits for it after resizing before it presses anything.
              data-room={room}
            >
              <ToolPalette
                activeId={toolId}
                onSelect={chooseTool}
                collapsed={!layout.railNames}
                onToggleCollapsed={focus ? undefined : toggleRail}
                view={view}
              />
              {layout.parts === 'strip' && (
                <PartsStrip
                  project={storeState.document.project}
                  selected={storeState.selection.features}
                  selectedParts={storeState.selection.parts}
                  onSelectPart={(partId) => store.selectParts([partId])}
                  toggle={
                    <PanelToggle
                      panel="parts"
                      shown={open === 'parts'}
                      onToggle={(press) => togglePanel('parts', press, true)}
                    />
                  }
                />
              )}
              {/* A panel's place in the DOM, docked or not (F.2): no panel is ever
              removed. Esc pressed inside it, open over the board, closes it. */}
              <div className="panel-slot" onKeyDown={overlayKeys('parts')}>
                {view === 'sheets' ? (
                  <SheetsParts
                    store={store}
                    project={storeState.document.project}
                    printStatus={printStatusFor(storeState.document.project)}
                    selected={sheetsSelected}
                    hoveredPart={hoveredPart}
                    onHoverPart={setHoveredPart}
                    toggle={
                      <PanelToggle
                        panel="parts"
                        shown
                        onToggle={(press) => togglePanel('parts', press, true)}
                      />
                    }
                  />
                ) : (
                  <PartsList
                    store={store}
                    project={storeState.document.project}
                    selected={storeState.selection.features}
                    selectedParts={storeState.selection.parts}
                    badges={badges}
                    printStatus={printStatusFor(storeState.document.project)}
                    onRemovePart={requestDeletePart}
                    onDuplicatePart={requestDuplicatePart}
                    onContextMenu={openContextMenu}
                    onOpenSample={() => void openSample()}
                    toggle={
                      <PanelToggle
                        panel="parts"
                        shown
                        onToggle={(press) => togglePanel('parts', press, true)}
                      />
                    }
                  />
                )}
              </div>
              {/* The drawing is what the window is for: its main landmark. A press
              on it closes a panel open over it. */}
              <main
                className="canvas-column"
                aria-label={t('app.drawing')}
                onPointerDown={open === null ? undefined : () => closeOverlay('pointer')}
              >
                <CanvasHost
                  // Made again for each tab: its tools and gestures are that
                  // project's, and its cameras the tab's (8.12).
                  key={tab.id}
                  cameras={tab.cameras}
                  ref={canvasRef}
                  store={store}
                  view={view}
                  hoveredPart={hoveredPart}
                  onHoverPart={setHoveredPart}
                  toolId={toolId}
                  nextId={nextId}
                  onStatus={handleStatus}
                  panelOver={open}
                  selectionBar={selectionBarOn ? tools : null}
                  drawAs={drawAs}
                  makerDefaults={makerDefaults}
                  hardware={hardware}
                  pointOptions={pointOptions}
                  requestDelete={requestDelete}
                  requestDeletePart={requestDeletePart}
                  onContextMenu={openContextMenu}
                >
                  {/* The legend explains the board's marks; the sheets are ink. */}
                  {view === 'design' && (
                    <CanvasLegend
                      project={storeState.document.project}
                      open={legendOpen}
                      onToggle={toggleLegend}
                    />
                  )}
                  {status !== null && (
                    <ZoomControl
                      percent={status.zoomPercent}
                      run={runZoom}
                      zoomTo={zoomTo}
                      fitSelectionRefusal={fitSelectionRefusal}
                    />
                  )}
                </CanvasHost>
                <ProblemsPanel
                  project={storeState.document.project}
                  diagnostics={diagnostics}
                  counts={counts}
                  onGoTo={goToDiagnostic}
                  open={problemsOpen}
                  onToggle={() => setProblemsOpen((open) => !open)}
                />
              </main>
              <div className="panel-slot" onKeyDown={overlayKeys('properties')}>
                {view === 'sheets' ? (
                  <SheetsProperties
                    store={store}
                    project={storeState.document.project}
                    selected={sheetsSelected}
                    toggle={
                      <PanelToggle
                        panel="properties"
                        shown
                        onToggle={(press) => togglePanel('properties', press, true)}
                      />
                    }
                  />
                ) : (
                  <PropertyPanel
                    store={store}
                    project={storeState.document.project}
                    selected={storeState.selection.features}
                    selectedParts={storeState.selection.parts}
                    diagnostics={diagnostics}
                    nextId={nextId}
                    requestDelete={requestDelete}
                    requestDeletePart={requestDeletePart}
                    tools={tools}
                    onTools={changePreferences}
                    drawingPiece={
                      DRAWING_TOOL_IDS.has(toolId) &&
                      (drawAs === 'outline' || drawAs === 'stitch-allowance')
                    }
                    sizing={status?.sizing ?? null}
                    toggle={
                      <PanelToggle
                        panel="properties"
                        shown
                        onToggle={(press) => togglePanel('properties', press, true)}
                      />
                    }
                  />
                )}
              </div>
              {layout.properties === 'strip' && (
                <PropertiesStrip
                  project={storeState.document.project}
                  selected={storeState.selection.features}
                  selectedParts={storeState.selection.parts}
                  onOpen={(press) => togglePanel('properties', press)}
                  toggle={
                    <PanelToggle
                      panel="properties"
                      shown={open === 'properties'}
                      onToggle={(press) => togglePanel('properties', press, true)}
                    />
                  }
                />
              )}
            </div>

            <footer className="app-status" data-testid="status-bar">
              {/*
          The counts stay put whatever else is being said. A notice used to
          replace them, which was harmless while every notice was a momentary
          refusal — but "select a part first" stands for as long as it is true,
          and hiding how many parts exist while telling the user to pick one is
          the wrong way round.
        */}
              <span className="status-left">
                <span data-testid="status-counts">
                  <VersionButton version={version} updates={updates} onCheck={checkUpdates} />
                  <span className="sep">·</span>
                  <b data-testid="part-count">{storeState.document.project.parts.length}</b>{' '}
                  {t('status.partsCount', { count: storeState.document.project.parts.length })}
                  <span className="sep">·</span>
                  <b data-testid="feature-count">{featureCount}</b>{' '}
                  {t('status.features', { count: featureCount })}
                  <span className="sep">·</span>
                  {/* A part picked by its heading is a selection too (Q29), and says so. */}
                  {storeState.selection.features.size === 0 &&
                  storeState.selection.parts.size > 0 ? (
                    <>
                      <b data-testid="selected-count">{storeState.selection.parts.size}</b>{' '}
                      {t('status.partsSelected', { count: storeState.selection.parts.size })}
                    </>
                  ) : (
                    <>
                      <b data-testid="selected-count">{storeState.selection.features.size}</b>{' '}
                      {t('status.selected')}
                    </>
                  )}
                  {diagnostics.length > 0 && (
                    <>
                      <span className="sep">·</span>
                      <b className="status-error" data-testid="problem-count">
                        {diagnostics.length}
                      </b>{' '}
                      {t('status.problems', { count: diagnostics.length })}
                    </>
                  )}
                  {tab.file.path !== null && (
                    <>
                      <span className="sep">·</span>
                      <span data-testid="file-path">{fileName(tab.file.path)}</span>
                    </>
                  )}
                </span>
                {status?.notice !== null && status?.notice !== undefined ? (
                  <span className="status-error" data-testid="tool-notice">
                    {describeProblem(status.notice, t)}
                  </span>
                ) : bridgeError !== null || tab.file.error !== null ? (
                  <span className="status-error" data-testid="file-error">
                    {bridgeError ?? fileErrorText(tab.file.error, t)}
                  </span>
                ) : null}
              </span>

              {/* Always all three (R-04): whatever shape a panel is in, its chip
              reaches it, so nothing is ever out of reach. */}
              <span className="status-panels" role="group" aria-label={t('status.panels')}>
                <PanelChip
                  testId="toggle-parts"
                  icon={CHIP_ICON.parts}
                  label={t('status.parts')}
                  command="toggleParts"
                  pressed={layout.parts === 'docked' || open === 'parts'}
                  hiding={layout.parts !== 'docked' && open !== 'parts'}
                  onPress={(press) => togglePanel('parts', press)}
                />
                <PanelChip
                  testId="toggle-focus"
                  icon={CHIP_ICON.focus}
                  label={t('status.focus')}
                  command="focusMode"
                  pressed={focus}
                  hiding={focus}
                  onPress={() => setFocus((on) => !on)}
                />
                <PanelChip
                  testId="toggle-properties"
                  icon={CHIP_ICON.properties}
                  label={t('status.properties')}
                  command="toggleProperties"
                  pressed={layout.properties === 'docked' || open === 'properties'}
                  hiding={layout.properties !== 'docked' && open !== 'properties'}
                  onPress={(press) => togglePanel('properties', press)}
                />
              </span>

              <span className="status-right" data-testid="cursor-readout">
                {view === 'sheets'
                  ? status?.sheet === null || status?.sheet === undefined
                    ? '—'
                    : t('status.sheetOf', status.sheet)
                  : status === null || status.cursorMm === null
                    ? '— , —'
                    : `${formatNumber(status.cursorMm.x, 2)} , ${formatMm(status.cursorMm.y)}`}
              </span>
            </footer>
          </>
        )}

        {/* A menu about nothing is not shown. */}
        {contextMenu !== null && !isEmptySelection(storeState.selection) && (
          <ContextMenu
            key={`${String(contextMenu.x)},${String(contextMenu.y)}`}
            at={contextMenu}
            label={t('contextMenu.label')}
            testId="context-menu"
            entries={selectionMenu(i18n, storeState.document.project, storeState.selection, {
              dispatch: (command) => store.dispatch(command),
              duplicatePart: requestDuplicatePart,
              deleteFeatures: requestDelete,
              deletePart: requestDeletePart,
            })}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* A text field's own (U.20): Cut, Copy, Paste and Select all. */}
        <TextFieldMenu />

        {settings !== null && (
          <SettingsDialog
            section={settings}
            onSection={setSettings}
            preferences={preferences}
            onPreferences={changePreferences}
            systemLanguages={systemLanguages}
            recentCount={recent.length}
            onClearRecent={() =>
              void getPlatformHost()
                .clearRecent()
                .then(refreshRecent)
                .catch(() => undefined)
            }
            onClose={() => setSettings(null)}
            nextId={nextId}
            updates={updates}
            onCheckUpdates={checkUpdates}
          />
        )}

        {aboutOpen && (
          <AboutDialog version={version} updates={updates} onClose={() => setAboutOpen(false)} />
        )}

        {notice !== null && (
          <MessageDialog title={notice.title} testId="file-notice" onClose={() => setNotice(null)}>
            <p>{notice.text}</p>
          </MessageDialog>
        )}

        {tabMenuAt !== null && menuTab !== undefined && (
          <TabContextMenu
            key={`${tabMenuAt.id}:${String(tabMenuAt.x)},${String(tabMenuAt.y)}`}
            tab={menuTab}
            at={tabMenuAt}
            othersOpen={openTabs.length > 1}
            actions={{
              rename: (how) => {
                tabs.activate(menuTab.id);
                setRenaming(how ?? 'pointer');
              },
              save: () => void file.save(menuTab),
              saveAs: () => void file.save(menuTab, true),
              reload: () =>
                void confirmDiscard('reload', menuTab).then((proceed) =>
                  proceed ? file.reload(menuTab) : undefined,
                ),
              duplicate: () => file.duplicate(menuTab),
              showInFolder: () => {
                if (menuTab.file.path !== null) {
                  void getPlatformHost()
                    .showInFolder(menuTab.file.path)
                    .catch(() => undefined);
                }
              },
              copyPath: () => {
                if (menuTab.file.path !== null) {
                  void navigator.clipboard.writeText(menuTab.file.path).catch(() => undefined);
                }
              },
              trash: () => setTrashing(menuTab),
              close: () => void closeTab(menuTab.id),
              closeOthers: () =>
                void (async () => {
                  for (const other of tabs.tabs.filter((each) => each !== menuTab)) {
                    // Each asks about its own unsaved work; Cancel keeps it and goes on.
                    await closeTab(other.id);
                  }
                })(),
            }}
            onClose={() => setTabMenuAt(null)}
          />
        )}

        {trashing !== null && trashing.file.path !== null && (
          <MessageDialog
            title={t('tabMenu.trashTitle', { name: tabName(trashing, t) })}
            testId="trash-dialog"
            onClose={() => setTrashing(null)}
            confirm={{
              label: t('tabMenu.trashConfirm'),
              danger: true,
              onConfirm: () => {
                const doomed = trashing;
                const path = doomed.file.path;
                setTrashing(null);
                if (path === null) return;
                void getPlatformHost()
                  .trashProjectFile(path)
                  // Its file is gone: the tab goes without a question.
                  .then(() => tabs.close(doomed.id))
                  .catch((error: unknown) =>
                    setNotice({
                      title: t('tabMenu.trashTitle', { name: tabName(doomed, t) }),
                      text: t('tabMenu.trashFailed', { reason: fileErrorText(error, t) }),
                    }),
                  );
              },
            }}
          >
            <p>
              {t(isDirty(trashing) ? 'tabMenu.trashBodyUnsaved' : 'tabMenu.trashBody', {
                file: trashing.file.path,
              })}
            </p>
          </MessageDialog>
        )}

        {printing && (
          <PrintPreview
            project={storeState.document.project}
            store={store}
            appVersion={version ?? '0.0.0'}
            diagnostics={diagnostics}
            // A problem chosen there is gone to, as from the drawer.
            onGoTo={(diagnostic) => {
              setPrinting(false);
              goToDiagnostic(diagnostic);
            }}
            // Where the app cannot print itself: the bytes previewed are the
            // bytes saved, and the export's own notice follows.
            onSavePdf={(bytes) => {
              setPrinting(false);
              void file.exportPdfFile(bytes).then(setExportNotice);
            }}
            onClose={() => setPrinting(false)}
          />
        )}

        {exportNotice !== null && (
          <ExportNotice report={exportNotice} onClose={() => setExportNotice(null)} />
        )}

        {recovery.offer !== null && (
          <RecoveryDialog
            projectName={recovery.offer.project.name}
            savedAt={recovery.offer.savedAt}
            onRecover={() => void recovery.recover()}
            onDecline={() => void recovery.decline()}
          />
        )}

        {pendingDiscard !== null && (
          <UnsavedChangesDialog
            projectName={tabName(pendingDiscard.tab, t)}
            action={pendingDiscard.action}
            // Saving an untitled project asks where; backing out of that asks
            // nothing further and changes nothing.
            onSave={() =>
              void file.save(pendingDiscard.tab).then((saved) => pendingDiscard.resolve(saved))
            }
            onDiscard={() => pendingDiscard.resolve(true)}
            onCancel={() => pendingDiscard.resolve(false)}
          />
        )}

        {pendingDelete !== null && (
          <DeleteDialog
            what={describeDelete(storeState.document.project, pendingDelete, t)}
            plan={planDelete(storeState.document.project, pendingDelete.ids)}
            onResolve={resolvePendingDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    </I18nProvider>
  );
}

/** The window's keys that need no project: the ways in, and the app's own (8.12). */
const WITHOUT_PROJECT: ReadonlySet<CommandId> = new Set<CommandId>([
  'newProject',
  'openProject',
  'settings',
  'keyboardShortcuts',
  'help',
]);

interface PendingDelete {
  readonly ids: readonly string[];
  /** Present when the whole part is being deleted, not only its features. */
  readonly partId?: string;
}

/** "Outline", "3 features" or the part's name, for the dialog's question. */
function describeDelete(project: Project, pending: PendingDelete, t: Translate): string {
  if (pending.partId !== undefined) {
    return (
      project.parts.find((part) => part.id === pending.partId)?.name ?? t('deleteDialog.thisPart')
    );
  }
  const named = project.parts
    .flatMap((part) => part.features)
    .filter((f) => pending.ids.includes(f.id));
  return named.length === 1 ? named[0]!.name : t('deleteDialog.features', { count: named.length });
}
