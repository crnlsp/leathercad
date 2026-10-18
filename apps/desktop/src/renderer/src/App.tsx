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
  type DeleteResolution,
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
import { systemIdSource, type Preferences, type RecentFile } from '@leathercad/platform';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

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
import { ROOM_PX, layoutFor, toggleOf, type Panel, type Room } from './panelLayout.js';
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
  // Design or Sheets (7.4c). View state, like the tool: never saved.
  const [view, setView] = useState<CanvasView>('design');
  /**
   * A part under the pointer — on a sheet, or on its Parts row — so the other
   * side can show it too (7.4d). View state, never saved.
   */
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const viewRef = useRef<CanvasView>('design');
  /** The tool the board had when the maker went to the sheets, to give back. */
  const designToolRef = useRef<string>('rectangle');

  /**
   * Going to the sheets leaves the drawing tools behind — nothing is drawn on
   * paper — and coming back gives the board its tool again.
   */
  const showView = useCallback(
    (next: CanvasView) => {
      if (viewRef.current === next) return;
      if (next === 'sheets') {
        designToolRef.current = toolId;
        setToolId('select');
      } else {
        setToolId(designToolRef.current);
      }
      viewRef.current = next;
      setView(next);
    },
    [toolId],
  );

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
  const chooseTool = useCallback((id: string) => {
    if (viewRef.current === 'sheets' && id !== 'select') {
      viewRef.current = 'design';
      setView('design');
    }
    setToolId(id);
  }, []);
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

  // The frame gives the board its room in §5's order (U.5): below 1280 px
  // the rail drops its names and Properties folds to a strip; below 900 Parts
  // leaves its column too. The maker's own folds are remembered, and the
  // window's never overwrite them. Opening the rail while narrow lasts the
  // session: it answers the window being small, not a liking.
  const narrow = useMediaQuery(`(max-width: ${String(ROOM_PX.wide - 1)}px)`);
  const cramped = useMediaQuery(`(max-width: ${String(ROOM_PX.narrow - 1)}px)`);
  const room: Room = cramped ? 'cramped' : narrow ? 'narrow' : 'wide';
  const [railExpandedWhileNarrow, setRailExpandedWhileNarrow] = useState(false);
  // Focus mode (`\`): both panels hide and the rail shows keys only, until `\`
  // or Esc. Nothing the maker chose changes, so leaving it restores exactly
  // what was there. For the session, like the view.
  const [focus, setFocus] = useState(false);
  const layout = layoutFor(
    room,
    {
      railCollapsed: preferences.toolRailCollapsed,
      railExpandedWhileNarrow,
      partsFolded: preferences.partsFolded,
      propertiesFolded: preferences.propertiesFolded,
    },
    focus,
  );
  const toggleRail = useCallback(() => {
    if (room !== 'wide') {
      setRailExpandedWhileNarrow((expanded) => !expanded);
      return;
    }
    changePreferences({ toolRailCollapsed: !preferences.toolRailCollapsed });
  }, [room, changePreferences, preferences.toolRailCollapsed]);

  // A panel opened over the board — from its strip, its chip or its key —
  // where it has no column (R-04). It takes focus, and gives it back to what
  // had it when the keyboard closes it; a press on the board closes it and
  // leaves focus where the press put it (U.4's rule). One at a time. A change
  // of room or of focus mode closes it: the panel may have its column now.
  const [overlay, setOverlay] = useState<{
    readonly panel: Panel;
    readonly opener: HTMLElement | null;
  } | null>(null);
  const [overlayIn, setOverlayIn] = useState(`${room} ${String(focus)}`);
  if (overlayIn !== `${room} ${String(focus)}`) {
    setOverlayIn(`${room} ${String(focus)}`);
    setOverlay(null);
  }
  const open = overlay?.panel ?? null;
  const closeOverlay = useCallback(
    (press: Press) => {
      if (press === 'keyboard') overlay?.opener?.focus();
      setOverlay(null);
    },
    [overlay],
  );
  // The panel itself takes focus, not its first button: a button would take
  // the Enter that finishes a polyline. Tab goes on into it, and out of it.
  useEffect(() => {
    if (open !== null) document.querySelector<HTMLElement>(`.panel.${open}`)?.focus();
  }, [open]);

  // A toggle that folds or unfolds its own panel goes with it: from the
  // keyboard, focus follows to the panel's toggle in its new shape.
  const followToggle = useRef<Panel | null>(null);
  const togglePanel = useCallback(
    (panel: Panel, press: Press, fromToggle = false) => {
      if (toggleOf(panel, room, focus) === 'overlay') {
        if (open === panel) closeOverlay(press);
        else {
          const active = document.activeElement;
          setOverlay({ panel, opener: active instanceof HTMLElement ? active : null });
        }
        return;
      }
      if (fromToggle && press === 'keyboard') followToggle.current = panel;
      changePreferences(
        panel === 'parts'
          ? { partsFolded: !preferences.partsFolded }
          : { propertiesFolded: !preferences.propertiesFolded },
      );
    },
    [
      room,
      focus,
      open,
      closeOverlay,
      changePreferences,
      preferences.partsFolded,
      preferences.propertiesFolded,
    ],
  );
  useEffect(() => {
    const panel = followToggle.current;
    followToggle.current = null;
    if (panel === null) return;
    [...document.querySelectorAll<HTMLElement>(`[data-panel-toggle="${panel}"]`)]
      .find((toggle) => toggle.getClientRects().length > 0)
      ?.focus();
  }, [layout.parts, layout.properties]);
  // Esc closes an overlay from inside it before anything behind it hears the
  // key. A menu open in it, or a field being typed in, keeps Esc for itself.
  const overlayKeys = (panel: Panel) => (event: ReactKeyboardEvent) => {
    if (open !== panel || isTyping(event.target)) return;
    if (!keysOf('cancel').some((binding) => matches(event, binding, IS_MAC))) return;
    event.stopPropagation();
    event.preventDefault();
    closeOverlay('keyboard');
  };
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

  const nextId = useMemo(() => createIdFactory(systemIdSource), []);
  const store = useMemo(() => new DocumentStore(emptyDocument(nextId(), 'Untitled')), [nextId]);

  // Mirror the store into React state so the chrome re-renders. The canvas
  // does not go through this path — it repaints from its own loop.
  const [storeState, setStoreState] = useState(() => store.getState());
  useEffect(() => store.subscribe(() => setStoreState(store.getState())), [store]);

  const blank = useCallback(() => emptyDocument(nextId(), 'Untitled'), [nextId]);
  const file = useProjectFile(store, getPlatformHost, version ?? '0.0.0', blank, t);
  const dirty = file.savedDocument.current !== storeState.document;

  // The window says which project it holds, and whether it has unsaved work
  // (F.8): the taskbar and the window switcher read this title.
  useEffect(() => {
    document.title = windowTitle(storeState.document.project, dirty, t);
  }, [storeState.document.project, dirty, t]);
  // And macOS's dot in the close button (U.7): the window's edited flag.
  useEffect(() => {
    void getPlatformHost()
      .setDocumentEdited(dirty)
      .catch(() => undefined);
  }, [dirty]);

  // Crash recovery (5.3b): a copy while there is unsaved work, and an offer of
  // what a crash left behind.
  const recovery = useRecovery({
    store,
    host: getPlatformHost,
    appVersion: version ?? '0.0.0',
    isDirty: file.isDirty,
    dirty,
    adoptRecovered: file.adoptRecovered,
  });

  // Never lose work silently (5.3a): closing the window, opening a project and
  // starting a new one all ask first when there is unsaved work, with one
  // question and one answer. Resolves true when the action may go ahead.
  const [pendingDiscard, setPendingDiscard] = useState<{
    action: DiscardingAction;
    resolve: (proceed: boolean) => void;
  } | null>(null);
  const discarding = useRef(false);
  const confirmDiscard = useCallback(
    (action: DiscardingAction): Promise<boolean> => {
      if (!file.isDirty()) return Promise.resolve(true);
      // One question at a time: a second close while it is on screen is
      // answered by the first.
      if (discarding.current) return Promise.resolve(false);
      discarding.current = true;
      return new Promise((resolve) =>
        setPendingDiscard({
          action,
          resolve: (proceed) => {
            discarding.current = false;
            setPendingDiscard(null);
            resolve(proceed);
          },
        }),
      );
    },
    [file],
  );

  const newProject = useCallback(async () => {
    if (await confirmDiscard('new')) file.newProject();
  }, [confirmDiscard, file]);
  const openProject = useCallback(async () => {
    if (await confirmDiscard('open')) await file.open();
  }, [confirmDiscard, file]);

  // Help's *Open sample project* (8.3, 8.7), and the empty Parts panel's offer of it.
  const openSample = useCallback(async () => {
    if (await confirmDiscard('open')) await file.openSample();
  }, [confirmDiscard, file]);

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
  // General says how many are listed, so it asks as Settings opens.
  useEffect(() => {
    if (settings !== null) refreshRecent();
  }, [settings, refreshRecent]);

  // A project double-clicked in the file manager (8.5), asked for once the
  // app is ready to open it.
  // `openPath` is stable, and the main process hands the file over once.
  const openPath = file.openPath;
  useEffect(() => {
    void getPlatformHost()
      .takeLaunchFile()
      .then((path) => (path === null ? undefined : openPath(path)))
      .catch(() => undefined);
  }, [openPath]);

  // A recent project (8.2, 8.7): the main process chose and granted the path;
  // unsaved work is asked about exactly as for Open.
  useEffect(
    () =>
      getPlatformHost().onOpenFile((path) => {
        void confirmDiscard('open').then((proceed) => (proceed ? file.openPath(path) : undefined));
      }),
    [confirmDiscard, file],
  );

  // The window's close button, Ctrl+Q and a reload all unload the page. With
  // unsaved work the unload is refused — Electron then keeps the window — and
  // the question is asked instead. An answer that lets it go closes the window
  // again, past this guard.
  const closing = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (closing.current || !file.isDirty()) return;
      event.preventDefault();
      event.returnValue = false;
      void confirmDiscard('close').then((proceed) => {
        if (!proceed) return;
        closing.current = true;
        window.close();
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [confirmDiscard, file]);

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
      save: () => void file.save(),
      saveAs: () => void file.save(true),
      openProject: () => void openProject(),
      newProject: () => void newProject(),
      exportPdf: () => void exportPdf(),
      print: () => setPrinting(true),
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
    exportPdf,
    newProject,
    openProject,
    showView,
    chooseTool,
    runZoom,
    togglePanel,
    open,
    focus,
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
      <div className="app">
        <ProjectBar
          project={storeState.document.project}
          store={store}
          dirty={dirty}
          saved={file.state.path !== null}
          room={room}
          view={view}
          onView={showView}
          counts={counts}
          settled={!store.inTransaction}
          onShowProblems={showProblems}
          helpRef={helpRef}
          onNew={() => void newProject()}
          onOpen={() => void openProject()}
          onSaveAs={() => void file.save(true)}
          recent={recent}
          onProjectMenuOpen={refreshRecent}
          // The main process checks it is on the list, grants it, and hands it
          // back through onOpenFile, which asks about unsaved work.
          onOpenRecent={(path) => getPlatformHost().openRecent(path)}
          onOpenSample={() => void openSample()}
          onAbout={() => setAboutOpen(true)}
          onSettings={() => setSettings('general')}
          onSave={() => void file.save()}
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
              v<span data-testid="app-version">{version ?? '…'}</span>
              <span className="sep">·</span>
              <b data-testid="part-count">{storeState.document.project.parts.length}</b>{' '}
              {t('status.partsCount', { count: storeState.document.project.parts.length })}
              <span className="sep">·</span>
              <b data-testid="feature-count">{featureCount}</b>{' '}
              {t('status.features', { count: featureCount })}
              <span className="sep">·</span>
              {/* A part picked by its heading is a selection too (Q29), and says so. */}
              {storeState.selection.features.size === 0 && storeState.selection.parts.size > 0 ? (
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
              {file.state.path !== null && (
                <>
                  <span className="sep">·</span>
                  <span data-testid="file-path">{fileName(file.state.path)}</span>
                </>
              )}
            </span>
            {status?.notice !== null && status?.notice !== undefined ? (
              <span className="status-error" data-testid="tool-notice">
                {describeProblem(status.notice, t)}
              </span>
            ) : bridgeError !== null || file.state.error !== null ? (
              <span className="status-error" data-testid="file-error">
                {bridgeError ?? fileErrorText(file.state.error, t)}
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
          />
        )}

        {aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}

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
            projectName={storeState.document.project.name}
            action={pendingDiscard.action}
            // Saving an untitled project asks where; backing out of that asks
            // nothing further and changes nothing.
            onSave={() => void file.save().then((saved) => pendingDiscard.resolve(saved))}
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
