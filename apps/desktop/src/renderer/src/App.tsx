import { createIdFactory, formatMm, formatNumber } from '@leathercad/core';
import {
  DocumentStore,
  deleteFeatures,
  deletePart,
  duplicatePart,
  emptyDocument,
  planDelete,
  setProjectName,
  type DeleteResolution,
} from '@leathercad/document';
import {
  badgesOf,
  describeProblem,
  diagnose,
  diagnosticTarget,
  evaluate,
  lockRefusal,
  type Diagnostic,
  type Project,
} from '@leathercad/domain';
import { systemIdSource } from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_HARDWARE, type DrawMode, type HardwareOptions } from '@leathercad/editor';

import { CanvasHost, type CanvasHandle, type CanvasStatus } from './CanvasHost.js';
import { CanvasLegend } from './CanvasLegend.js';
import { DeleteDialog } from './DeleteDialog.js';
import { ExportNotice } from './ExportNotice.js';
import { useProjectFile, type ExportReport } from './useProjectFile.js';
import { PaperControl } from './PaperControl.js';
import { PartsList } from './PartsList.js';
import { ProblemsPanel } from './ProblemsPanel.js';
import { PropertyPanel } from './PropertyPanel.js';
import { ToolOptions } from './ToolOptions.js';
import { ToolPalette } from './ToolPalette.js';
import { UnsavedChangesDialog, type DiscardingAction } from './UnsavedChangesDialog.js';
import { RecoveryDialog } from './RecoveryDialog.js';
import { useRecovery } from './useRecovery.js';
import { getPlatformHost } from './platformBridge.js';
import { ALL_TOOLS } from './tools.js';
import { Tooltip } from './Tooltip.js';
import { useMediaQuery } from './useMediaQuery.js';

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [toolId, setToolId] = useState<string>('rectangle');
  // What a drawn line becomes, and what the hardware tool punches. Owned
  // here because both outlive the tool they configure: switching to the arc
  // tool and back must not silently put the user back on 'Cut'.
  const [drawAs, setDrawAs] = useState<DrawMode>('outline');
  const [hardware, setHardware] = useState<HardwareOptions>(DEFAULT_HARDWARE);

  // The frame's own state (UI Foundations §7.1–7.2). None of it is the
  // document's, and none of it is persisted with it.
  //
  // The rail collapses by itself below 1200 px, and follows the maker's own
  // choice above it. The choice lasts the session: persisting it belongs in
  // preferences.json (slice 8.2) — not localStorage, which a second window
  // blocks on for seconds because both share one profile.
  const railAutoCollapsed = useMediaQuery('(max-width: 1199px)');
  const [railPreferCollapsed, setRailPreferCollapsed] = useState(false);
  const [railExpandedWhileNarrow, setRailExpandedWhileNarrow] = useState(false);
  const railCollapsed = railAutoCollapsed ? !railExpandedWhileNarrow : railPreferCollapsed;
  const toggleRail = useCallback(() => {
    if (railAutoCollapsed) {
      setRailExpandedWhileNarrow((expanded) => !expanded);
      return;
    }
    setRailPreferCollapsed((collapsed) => !collapsed);
  }, [railAutoCollapsed]);

  const [problemsOpen, setProblemsOpen] = useState(false);
  // Below these widths a panel stops taking a column and becomes an overlay
  // opened from the status bar — never removed, because the parts tree is the
  // only route to a locked feature (audit §3.3).
  const propertiesOverlay = useMediaQuery('(max-width: 1023px)');
  const partsOverlay = useMediaQuery('(max-width: 899px)');
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);

  const nextId = useMemo(() => createIdFactory(systemIdSource), []);
  const store = useMemo(() => new DocumentStore(emptyDocument(nextId(), 'Untitled')), [nextId]);

  // Mirror the store into React state so the chrome re-renders. The canvas
  // does not go through this path — it repaints from its own loop.
  const [storeState, setStoreState] = useState(() => store.getState());
  useEffect(() => store.subscribe(() => setStoreState(store.getState())), [store]);

  const blank = useCallback(() => emptyDocument(nextId(), 'Untitled'), [nextId]);
  const file = useProjectFile(store, getPlatformHost, version ?? '0.0.0', blank);
  const dirty = file.savedDocument.current !== storeState.document;

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

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
        }
        return;
      }

      // The active tool claimed this key (the polyline's A and L mid-run).
      if (event.defaultPrevented) return;
      const match = ALL_TOOLS.find((tool) => tool.key.toLowerCase() === event.key.toLowerCase());
      if (match !== undefined) setToolId(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, exportPdf, newProject, openProject]);

  // The application menu (8.5a) runs the same handlers as the keys above, so
  // a menu choice and a shortcut cannot come to mean different things.
  useEffect(
    () =>
      getPlatformHost().onMenuAction((action) => {
        switch (action) {
          case 'new':
            void newProject();
            break;
          case 'open':
            void openProject();
            break;
          case 'save':
            void file.save();
            break;
          case 'save-as':
            void file.save(true);
            break;
          case 'export-pdf':
            void exportPdf();
            break;
          case 'undo':
            store.undo();
            break;
          case 'redo':
            store.redo();
            break;
        }
      }),
    [file, exportPdf, newProject, openProject, store],
  );

  const handleStatus = useCallback((next: CanvasStatus) => setStatus(next), []);

  // The canvas owns the viewport; this is the only handle on it, and the only
  // thing anyone asks it for is "show me this rectangle".
  const canvasRef = useRef<CanvasHandle>(null);

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

      if (target.bounds !== null) canvasRef.current?.frame(target.bounds);
    },
    [store],
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
      if (
        lockRefusal(project, [...plan.requested, ...plan.dependents.map((d) => d.featureId)]) !==
        null
      ) {
        return;
      }
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
      const plan = planDelete(project, ids);
      if (
        lockRefusal(project, [...plan.requested, ...plan.dependents.map((d) => d.featureId)]) !==
        null
      ) {
        return;
      }
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
    <div className="app">
      <header className="app-header">
        <h1>LeatherCAD</h1>

        <Tooltip text="Project name — used for the file name and the PDF footer">
          <input
            className="project-name"
            data-testid="project-name"
            aria-label="Project name"
            value={storeState.document.project.name}
            placeholder="Untitled"
            onChange={(event) => store.dispatch(setProjectName(event.target.value))}
          />
        </Tooltip>

        <div className="toolbar history" data-testid="history-group">
          {/* Names what it will undo. Disabled needs no reason beyond its own
              label: there is nothing to undo. */}
          <Tooltip text={storeState.undoLabel === null ? null : `Undo ${storeState.undoLabel}`}>
            <button
              type="button"
              className="tool"
              data-testid="undo"
              disabled={!storeState.canUndo}
              onClick={() => store.undo()}
            >
              Undo
            </button>
          </Tooltip>
          <button
            type="button"
            className="tool"
            data-testid="redo"
            disabled={!storeState.canRedo}
            onClick={() => store.redo()}
          >
            Redo
          </button>
        </div>

        <div className="toolbar">
          <Tooltip text="Start a new project (Ctrl+N)">
            <button
              type="button"
              className="tool"
              data-testid="new"
              onClick={() => void newProject()}
            >
              New
            </button>
          </Tooltip>
          <Tooltip text="Open a project (Ctrl+O)">
            <button
              type="button"
              className="tool"
              data-testid="open"
              onClick={() => void openProject()}
            >
              Open
            </button>
          </Tooltip>
          <Tooltip text="Save (Ctrl+S) · Save as (Ctrl+Shift+S)">
            <button
              type="button"
              className="tool"
              data-testid="save"
              onClick={() => void file.save()}
            >
              Save{dirty ? ' •' : ''}
            </button>
          </Tooltip>
          <PaperControl settings={storeState.document.project.settings} store={store} />
          <Tooltip
            text={`Export a print-ready PDF at 1:1 on ${storeState.document.project.settings.paper} ${storeState.document.project.settings.orientation} (Ctrl+E)`}
          >
            <button
              type="button"
              className="tool"
              data-testid="export-pdf"
              onClick={() => void exportPdf()}
            >
              Export PDF
            </button>
          </Tooltip>
        </div>

        {/* What the active tool does with a click or a drag, true for that tool
            and no other (F.1). Getting about the canvas comes last, so it is
            what gives way when the header narrows. */}
        <span className="app-hint" data-testid="tool-how-to">
          {howToFor(toolId)} · scroll zooms · middle-drag pans
        </span>
      </header>

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
          onSelect={setToolId}
          collapsed={railCollapsed}
          onToggleCollapsed={toggleRail}
        />
        <PartsList
          store={store}
          project={storeState.document.project}
          selected={storeState.selection.features}
          selectedParts={storeState.selection.parts}
          badges={badges}
          onRemovePart={requestDeletePart}
          onDuplicatePart={requestDuplicatePart}
        />
        {/* The drawing is what the window is for: its main landmark. */}
        <main className="canvas-column" aria-label="Drawing">
          <ToolOptions
            toolId={toolId}
            drawAs={drawAs}
            onDrawAs={setDrawAs}
            hardware={hardware}
            onHardware={setHardware}
          />
          <CanvasHost
            ref={canvasRef}
            store={store}
            toolId={toolId}
            nextId={nextId}
            onStatus={handleStatus}
            drawAs={drawAs}
            hardware={hardware}
            requestDelete={requestDelete}
          >
            <CanvasLegend project={storeState.document.project} />
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
          diagnostics={diagnostics}
          nextId={nextId}
          requestDelete={requestDelete}
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
              Parts
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
              Properties
            </button>
          )}
          <span data-testid="status-counts">
            v<span data-testid="app-version">{version ?? '…'}</span>
            <span className="sep">·</span>
            <b data-testid="part-count">{storeState.document.project.parts.length}</b> parts
            <span className="sep">·</span>
            <b data-testid="feature-count">{featureCount}</b> features
            <span className="sep">·</span>
            <b data-testid="selected-count">{storeState.selection.features.size}</b> selected
            {diagnostics.length > 0 && (
              <>
                <span className="sep">·</span>
                <b className="status-error" data-testid="problem-count">
                  {diagnostics.length}
                </b>{' '}
                {diagnostics.length === 1 ? 'problem' : 'problems'}
              </>
            )}
            {file.state.path !== null && (
              <>
                <span className="sep">·</span>
                <span data-testid="file-path">{fileName(file.state.path)}</span>
                {dirty && <span className="dirty"> unsaved</span>}
              </>
            )}
          </span>
          {status?.notice !== null && status?.notice !== undefined ? (
            <span className="status-error" data-testid="tool-notice">
              {describeProblem(status.notice)}
            </span>
          ) : bridgeError !== null || file.state.error !== null ? (
            <span className="status-error" data-testid="file-error">
              {bridgeError ?? file.state.error}
            </span>
          ) : null}
        </span>

        <span className="status-right" data-testid="cursor-readout">
          {status === null || status.cursorMm === null
            ? '— , —'
            : `${formatNumber(status.cursorMm.x, 2)} , ${formatMm(status.cursorMm.y)}`}
        </span>
      </footer>

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
          what={describeDelete(storeState.document.project, pendingDelete)}
          plan={planDelete(storeState.document.project, pendingDelete.ids)}
          onResolve={resolvePendingDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

interface PendingDelete {
  readonly ids: readonly string[];
  /** Present when the whole part is being deleted, not only its features. */
  readonly partId?: string;
}

/** "Outline", "3 features" or the part's name, for the dialog's question. */
function describeDelete(project: Project, pending: PendingDelete): string {
  if (pending.partId !== undefined) {
    return project.parts.find((part) => part.id === pending.partId)?.name ?? 'this part';
  }
  const named = project.parts
    .flatMap((part) => part.features)
    .filter((f) => pending.ids.includes(f.id));
  return named.length === 1 ? named[0]!.name : `${String(named.length)} features`;
}

/** The active tool's one line of guidance. */
function howToFor(toolId: string): string {
  return ALL_TOOLS.find((tool) => tool.id === toolId)?.howTo ?? '';
}
