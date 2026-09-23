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
  type ExportReadiness,
  type Project,
} from '@leathercad/domain';
import { systemIdSource } from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_HARDWARE, type DrawMode, type HardwareOptions } from '@leathercad/editor';

import { CanvasHost, type CanvasHandle, type CanvasStatus } from './CanvasHost.js';
import { DeleteDialog } from './DeleteDialog.js';
import { ExportNotice } from './ExportNotice.js';
import { useProjectFile } from './useProjectFile.js';
import { PartsList } from './PartsList.js';
import { ProblemsPanel } from './ProblemsPanel.js';
import { PropertyPanel } from './PropertyPanel.js';
import { ToolOptions } from './ToolOptions.js';
import { ToolPalette } from './ToolPalette.js';
import { getPlatformHost } from './platformBridge.js';
import { ALL_TOOLS } from './tools.js';

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

  const nextId = useMemo(() => createIdFactory(systemIdSource), []);
  const store = useMemo(() => new DocumentStore(emptyDocument(nextId(), 'Untitled')), [nextId]);

  // Mirror the store into React state so the chrome re-renders. The canvas
  // does not go through this path — it repaints from its own loop.
  const [storeState, setStoreState] = useState(() => store.getState());
  useEffect(() => store.subscribe(() => setStoreState(store.getState())), [store]);

  const file = useProjectFile(store, getPlatformHost, version ?? '0.0.0');
  const dirty = file.savedDocument.current !== storeState.document;

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
  const [exportNotice, setExportNotice] = useState<ExportReadiness | null>(null);

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
          void file.open();
        } else if (key === 'e') {
          event.preventDefault();
          void exportPdf();
        }
        return;
      }

      const match = ALL_TOOLS.find((tool) => tool.key.toLowerCase() === event.key.toLowerCase());
      if (match !== undefined) setToolId(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, exportPdf]);

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

        <input
          className="project-name"
          data-testid="project-name"
          value={storeState.document.project.name}
          placeholder="Untitled"
          title="Project name — used for the file name and the PDF footer"
          onChange={(event) => store.dispatch(setProjectName(event.target.value))}
        />

        <div className="toolbar history" data-testid="history-group">
          <button
            type="button"
            className="tool"
            data-testid="undo"
            disabled={!storeState.canUndo}
            onClick={() => store.undo()}
            title={
              storeState.undoLabel === null ? 'Nothing to undo' : `Undo ${storeState.undoLabel}`
            }
          >
            Undo
          </button>
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
          <button
            type="button"
            className="tool"
            data-testid="open"
            onClick={() => void file.open()}
            title="Open a project (Ctrl+O)"
          >
            Open
          </button>
          <button
            type="button"
            className="tool"
            data-testid="save"
            onClick={() => void file.save()}
            title="Save (Ctrl+S)"
          >
            Save{dirty ? ' •' : ''}
          </button>
          <button
            type="button"
            className="tool"
            data-testid="export-pdf"
            onClick={() => void exportPdf()}
            title="Export a print-ready PDF at 1:1 (Ctrl+E)"
          >
            Export PDF
          </button>
        </div>

        <span className="app-hint">
          drag to draw · middle-drag or alt-drag to pan · scroll to zoom · Del removes
        </span>
      </header>

      <div className="workspace">
        <div className="left-column">
          <ToolPalette activeId={toolId} onSelect={setToolId} />
          <PartsList
            store={store}
            project={storeState.document.project}
            selected={storeState.selection.features}
            selectedParts={storeState.selection.parts}
            badges={badges}
            onRemovePart={requestDeletePart}
            onDuplicatePart={requestDuplicatePart}
          />
          <ProblemsPanel
            project={storeState.document.project}
            diagnostics={diagnostics}
            onGoTo={goToDiagnostic}
          />
        </div>
        <div className="canvas-column">
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
          />
        </div>
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
        <ExportNotice readiness={exportNotice} onClose={() => setExportNotice(null)} />
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
