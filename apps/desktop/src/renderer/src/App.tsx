import { createIdFactory } from '@leathercad/core';
import { DocumentStore, emptyDocument } from '@leathercad/document';
import { systemIdSource } from '@leathercad/platform';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CanvasHost, type CanvasStatus } from './CanvasHost.js';
import { getPlatformHost } from './platformBridge.js';

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'rectangle', label: 'Rectangle', key: 'R' },
] as const;

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [toolId, setToolId] = useState<string>('rectangle');

  const nextId = useMemo(() => createIdFactory(systemIdSource), []);
  const store = useMemo(() => new DocumentStore(emptyDocument(nextId(), 'Untitled')), [nextId]);

  // Mirror the store into React state so the chrome re-renders. The canvas
  // does not go through this path — it repaints from its own loop.
  const [storeState, setStoreState] = useState(() => store.getState());
  useEffect(() => store.subscribe(() => setStoreState(store.getState())), [store]);

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
      if (event.ctrlKey || event.metaKey) return;
      const match = TOOLS.find((tool) => tool.key.toLowerCase() === event.key.toLowerCase());
      if (match !== undefined) setToolId(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleStatus = useCallback((next: CanvasStatus) => setStatus(next), []);

  const featureCount = storeState.document.project.parts.reduce(
    (total, part) => total + part.features.length,
    0,
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>LeatherCAD</h1>

        <div className="toolbar" role="toolbar" aria-label="Tools">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={tool.id === toolId ? 'tool active' : 'tool'}
              data-testid={`tool-${tool.id}`}
              onClick={() => setToolId(tool.id)}
              title={`${tool.label} (${tool.key})`}
            >
              {tool.label}
              <kbd>{tool.key}</kbd>
            </button>
          ))}
        </div>

        <div className="toolbar">
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

        <span className="app-hint">
          drag to draw · middle-drag or alt-drag to pan · scroll to zoom · Del removes
        </span>
      </header>

      <CanvasHost store={store} toolId={toolId} nextId={nextId} onStatus={handleStatus} />

      <footer className="app-status" data-testid="status-bar">
        {bridgeError !== null ? (
          <span className="status-error" data-testid="bridge-error">
            Platform bridge failed: {bridgeError}
          </span>
        ) : (
          <span data-testid="bridge-ok">
            v<span data-testid="app-version">{version ?? '…'}</span>
            <span className="sep">·</span>
            <b data-testid="part-count">{storeState.document.project.parts.length}</b> parts
            <span className="sep">·</span>
            <b>{featureCount}</b> features
            <span className="sep">·</span>
            <b data-testid="selected-count">{storeState.selection.features.size}</b> selected
          </span>
        )}

        <span className="status-right" data-testid="cursor-readout">
          {status === null || status.cursorMm === null
            ? '— , —'
            : `${status.cursorMm.x.toFixed(2)} , ${status.cursorMm.y.toFixed(2)} mm`}
        </span>
      </footer>
    </div>
  );
}
