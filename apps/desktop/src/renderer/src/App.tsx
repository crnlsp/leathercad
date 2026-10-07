import { createIdFactory, formatMm, formatNumber } from '@leathercad/core';
import {
  DocumentStore,
  deleteFeatures,
  deletePart,
  deleteRefusal,
  duplicatePart,
  emptyDocument,
  isEmptySelection,
  planDelete,
  type DeleteResolution,
} from '@leathercad/document';
import {
  badgesOf,
  diagnose,
  diagnosticTarget,
  evaluate,
  type Diagnostic,
  type Project,
} from '@leathercad/domain';
import { systemIdSource, type Preferences, type RecentFile } from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { ExportNotice } from './ExportNotice.js';
import { PrintPreview } from './PrintPreview.js';
import { fileErrorText, useProjectFile, type ExportReport } from './useProjectFile.js';
import { ProjectBar, windowTitle } from './ProjectBar.js';
import { printStatusFor } from './sheets.js';
import { SheetsSummary, ViewSwitch } from './ViewSwitch.js';
import { PartsList } from './PartsList.js';
import { historyText } from './historyText.js';
import { describeProblem } from './problemText.js';
import { ProblemsPanel } from './ProblemsPanel.js';
import { PropertyPanel } from './PropertyPanel.js';
import { ToolOptions } from './ToolOptions.js';
import { ToolPalette } from './ToolPalette.js';
import { UnsavedChangesDialog, type DiscardingAction } from './UnsavedChangesDialog.js';
import { I18nProvider } from './i18n.js';
import { RecoveryDialog } from './RecoveryDialog.js';
import { SettingsDialog, type SettingsSection } from './SettingsDialog.js';
import { isTyping } from './shortcuts.js';
import { useRecovery } from './useRecovery.js';
import { getPlatformHost } from './platformBridge.js';
import { ALL_TOOLS } from './tools.js';
import { Tooltip } from './Tooltip.js';
import { useMediaQuery } from './useMediaQuery.js';

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** How far one step of the zoom keys goes (8.4b). */
const ZOOM_STEP = 1.25;

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
  const changePreferences = useCallback((changes: Partial<Preferences>) => {
    setPreferences((previous) => ({ ...previous, ...changes }));
    // A preference that could not be kept still applies to this session.
    void getPlatformHost()
      .setPreferences(changes)
      .catch(() => undefined);
  }, []);

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

  // The rail collapses by itself below 1200 px, and follows the maker's own
  // remembered choice above it. Opening it while narrow lasts the session:
  // it answers the window being small, not a liking.
  const railAutoCollapsed = useMediaQuery('(max-width: 1199px)');
  const [railExpandedWhileNarrow, setRailExpandedWhileNarrow] = useState(false);
  const railCollapsed = railAutoCollapsed
    ? !railExpandedWhileNarrow
    : preferences.toolRailCollapsed;
  const toggleRail = useCallback(() => {
    if (railAutoCollapsed) {
      setRailExpandedWhileNarrow((expanded) => !expanded);
      return;
    }
    changePreferences({ toolRailCollapsed: !preferences.toolRailCollapsed });
  }, [railAutoCollapsed, changePreferences, preferences.toolRailCollapsed]);
  const toggleLegend = useCallback(
    () => changePreferences({ legendOpen: !preferences.legendOpen }),
    [changePreferences, preferences.legendOpen],
  );
  // Settings (8.7), open on a section, or closed.
  const [settings, setSettings] = useState<SettingsSection | null>(null);

  const [problemsOpen, setProblemsOpen] = useState(false);
  // Below these widths a panel stops taking a column and becomes an overlay
  // opened from the status bar — never removed, because the parts tree is the
  // only route to a locked feature (audit §3.3).
  const propertiesOverlay = useMediaQuery('(max-width: 1023px)');
  const partsOverlay = useMediaQuery('(max-width: 899px)');
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);

  // The canvas owns the viewport; this is the only handle on it. Anyone may
  // ask it to show a rectangle, zoom about its centre, or fit the pattern.
  const canvasRef = useRef<CanvasHandle>(null);

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

  // The Print Preview (7.6), open or not.
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTyping(event.target)) return;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 's') {
          event.preventDefault();
          void file.save(event.shiftKey);
        } else if (key === 'o') {
          event.preventDefault();
          void openProject();
        } else if (key === 'n') {
          event.preventDefault();
          void newProject();
        } else if (key === 'e') {
          event.preventDefault();
          void exportPdf();
        } else if (key === 'p') {
          event.preventDefault();
          setPrinting(true);
        } else if (key === '1') {
          event.preventDefault();
          showView('design');
        } else if (key === '2') {
          event.preventDefault();
          showView('sheets');
        } else if (key === '/') {
          event.preventDefault();
          setSettings('shortcuts');
        } else if (key === ',') {
          event.preventDefault();
          setSettings('general');
        } else if (key === '=' || key === '+') {
          // The view (8.4b): zoom in, zoom out, and fit the pattern.
          event.preventDefault();
          canvasRef.current?.zoom(ZOOM_STEP);
        } else if (key === '-') {
          event.preventDefault();
          canvasRef.current?.zoom(1 / ZOOM_STEP);
        } else if (key === '0') {
          event.preventDefault();
          canvasRef.current?.fit();
        }
        return;
      }

      // The shortcut map (8.2), where many apps keep it: in Settings (8.7).
      if (event.key === '?') {
        event.preventDefault();
        setSettings('shortcuts');
        return;
      }

      // The active tool claimed this key (the polyline's A and L mid-run).
      if (event.defaultPrevented) return;
      const match = ALL_TOOLS.find((tool) => tool.key.toLowerCase() === event.key.toLowerCase());
      if (match !== undefined) chooseTool(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, exportPdf, newProject, openProject, showView, chooseTool]);

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
          onNew={() => void newProject()}
          onOpen={() => void openProject()}
          onSaveAs={() => void file.save(true)}
          recent={recent}
          onProjectMenuOpen={refreshRecent}
          // The main process checks it is on the list, grants it, and hands it
          // back through onOpenFile, which asks about unsaved work.
          onOpenRecent={(path) =>
            void getPlatformHost()
              .openRecent(path)
              .catch(() => undefined)
          }
          onOpenSample={() => void openSample()}
          onAbout={() => setAboutOpen(true)}
          onSettings={() => setSettings('general')}
          onSave={() => void file.save()}
          onExport={() => void exportPdf()}
          onPrint={() => setPrinting(true)}
        />

        {/* The work bar (F.8): what the maker is doing right now — history, the
          active tool's options and its one line of guidance. The project and
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
            <button
              type="button"
              className="tool"
              data-testid="redo"
              disabled={!storeState.canRedo}
              onClick={() => store.redo()}
            >
              {t('work.redo')}
            </button>
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
              {/* What the active tool does with a click or a drag, true for that
                tool and no other (F.1). It is what gives way when the bar narrows. */}
              <span className="work-hint" data-testid="tool-how-to">
                {t('work.howTo', { howTo: howToFor(toolId, t) })}
              </span>
            </>
          ) : (
            <SheetsSummary project={storeState.document.project} />
          )}
          <ViewSwitch view={view} onView={showView} />
        </div>

        <div
          className={[
            'workspace',
            railCollapsed ? 'rail-collapsed' : '',
            propertiesOverlay ? 'properties-overlay' : '',
            propertiesOverlay && propertiesOpen ? 'properties-open' : '',
            partsOverlay ? 'parts-overlay' : '',
            partsOverlay && partsOpen ? 'parts-open' : '',
          ]
            .filter((name) => name !== '')
            .join(' ')}
        >
          <ToolPalette
            activeId={toolId}
            onSelect={chooseTool}
            collapsed={railCollapsed}
            onToggleCollapsed={toggleRail}
          />
          <PartsList
            store={store}
            project={storeState.document.project}
            selected={storeState.selection.features}
            selectedParts={storeState.selection.parts}
            badges={badges}
            printStatus={printStatusFor(storeState.document.project)}
            hoveredPart={view === 'sheets' ? hoveredPart : null}
            onHoverPart={view === 'sheets' ? setHoveredPart : undefined}
            onRemovePart={requestDeletePart}
            onDuplicatePart={requestDuplicatePart}
            onContextMenu={openContextMenu}
            onOpenSample={() => void openSample()}
          />
          {/* The drawing is what the window is for: its main landmark. */}
          <main className="canvas-column" aria-label={t('app.drawing')}>
            <CanvasHost
              ref={canvasRef}
              store={store}
              view={view}
              hoveredPart={hoveredPart}
              onHoverPart={setHoveredPart}
              toolId={toolId}
              nextId={nextId}
              onStatus={handleStatus}
              drawAs={drawAs}
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
                  open={preferences.legendOpen}
                  onToggle={toggleLegend}
                />
              )}
            </CanvasHost>
            <ProblemsPanel
              project={storeState.document.project}
              diagnostics={diagnostics}
              onGoTo={goToDiagnostic}
              open={problemsOpen}
              onToggle={() => setProblemsOpen((open) => !open)}
            />
          </main>
          <PropertyPanel
            store={store}
            project={storeState.document.project}
            selected={storeState.selection.features}
            selectedParts={storeState.selection.parts}
            diagnostics={diagnostics}
            nextId={nextId}
            requestDelete={requestDelete}
            requestDeletePart={requestDeletePart}
          />
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
            {/* Only where a panel has become an overlay: the way back to it. */}
            {partsOverlay && (
              <button
                type="button"
                className="chip"
                data-testid="toggle-parts"
                aria-pressed={partsOpen}
                onClick={() => setPartsOpen((open) => !open)}
              >
                {t('status.parts')}
              </button>
            )}
            {propertiesOverlay && (
              <button
                type="button"
                className="chip"
                data-testid="toggle-properties"
                aria-pressed={propertiesOpen}
                onClick={() => setPropertiesOpen((open) => !open)}
              >
                {t('status.properties')}
              </button>
            )}
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
          />
        )}

        {aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}

        {printing && (
          <PrintPreview
            project={storeState.document.project}
            store={store}
            appVersion={version ?? '0.0.0'}
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

/** The active tool's one line of guidance. */
function howToFor(toolId: string, t: Translate): string {
  const tool = ALL_TOOLS.find((entry) => entry.id === toolId);
  return tool === undefined ? '' : t(`tools.${tool.id}.howTo`);
}
