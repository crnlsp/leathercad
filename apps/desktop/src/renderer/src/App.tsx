import { useCallback, useEffect, useMemo, useState } from 'react';

import { CanvasHost, type CanvasStatus } from './CanvasHost.js';
import { getPlatformHost } from './platformBridge.js';
import { buildDemoScene, demoBounds } from './scene.js';

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);

  // Built once: the geometry is fixed, and rebuilding it per render would
  // recompute ninety stitch positions on every pointer move.
  const { list, report } = useMemo(() => buildDemoScene(), []);
  const bounds = useMemo(() => demoBounds(), []);

  useEffect(() => {
    void (async () => {
      try {
        setVersion(await getPlatformHost().getAppVersion());
      } catch (error) {
        setBridgeError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  const handleStatus = useCallback((next: CanvasStatus) => setStatus(next), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>LeatherCAD</h1>
        <span className="app-subtitle">pattern design at 1:1</span>
        <span className="app-hint">scroll to zoom · drag to pan · double-click to fit</span>
      </header>

      <CanvasHost scene={list} initialBounds={bounds} onStatus={handleStatus} />

      <footer className="app-status" data-testid="status-bar">
        {bridgeError !== null ? (
          <span className="status-error" data-testid="bridge-error">
            Platform bridge failed: {bridgeError}
          </span>
        ) : (
          <span data-testid="bridge-ok">
            v<span data-testid="app-version">{version ?? '…'}</span>
            <span className="sep">·</span>
            perimeter <b>{report.perimeterMm.toFixed(2)} mm</b>
            <span className="sep">·</span>
            stitch line <b>{report.stitchLengthMm.toFixed(2)} mm</b>
            <span className="sep">·</span>
            <b>{report.holeCount}</b> holes at <b>{report.achievedPitchMm.toFixed(3)} mm</b>
          </span>
        )}

        <span className="status-right" data-testid="cursor-readout">
          {status === null || status.cursorMm === null
            ? '— , —'
            : `${status.cursorMm.x.toFixed(2)} , ${status.cursorMm.y.toFixed(2)} mm`}
          <span className="sep">·</span>
          {status === null ? '' : `${status.scale.toFixed(2)} px/mm`}
        </span>
      </footer>
    </div>
  );
}
