import { createIdFactory } from '@leathercad/core';
import {
  DocumentStore,
  deleteFeatures,
  deletePart,
  emptyDocument,
  planDelete,
  setProjectName,
  type DeleteResolution,
} from '@leathercad/document';
import { describeProblem, diagnose, type Project } from '@leathercad/domain';
import { systemIdSource } from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_HARDWARE, type DrawMode, type HardwareOptions } from '@leathercad/editor';

import { CanvasHost, type CanvasStatus } from './CanvasHost.js';
import { DeleteDialog } from './DeleteDialog.js';
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
          void file.exportPdfFile();
        }
        return;
      }

      const match = ALL_TOOLS.find((tool) => tool.key.toLowerCase() === event.key.toLowerCase());
      if (match !== undefined) setToolId(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file]);

  const handleStatus = useCallback((next: CanvasStatus) => setStatus(next), []);

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
      const plan = planDelete(store.getState().document.project, ids);
      if (plan.requested.length === 0) return;
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
      if (planDelete(store.getState().document.project, ids).dependents.length === 0) {
        store.dispatch(deletePart(partId));
        store.clearSelection();
        return;
      }
      setPendingDelete({ ids, partId });
    },
    [store],
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
            onClick={() => void file.exportPdfFile()}
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
            onRemovePart={requestDeletePart}
          />
          <ProblemsPanel
            store={store}
            project={storeState.document.project}
            diagnostics={diagnostics}
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
            : `${status.cursorMm.x.toFixed(2)} , ${status.cursorMm.y.toFixed(2)} mm`}
        </span>
      </footer>

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
