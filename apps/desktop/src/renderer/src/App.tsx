import { useCallback, useEffect, useState } from 'react';

import { CanvasHost, type CanvasMetrics } from './CanvasHost.js';
import { getPlatformHost } from './platformBridge.js';

/**
 * Slice 0.2 shell. Deliberately plain: this exists to prove the window opens,
 * React renders, the PlatformHost bridge works end to end, and the canvas is
 * correctly sized for the display. The actual editor UI is designed later,
 * once there is something to edit.
 */
export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [configDir, setConfigDir] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CanvasMetrics | null>(null);

  useEffect(() => {
    // A round trip through preload → IPC → main and back. If this renders, the
    // whole platform boundary is wired correctly.
    void (async () => {
      try {
        const host = getPlatformHost();
        const [v, dir] = await Promise.all([host.getAppVersion(), host.getUserConfigDir()]);
        setVersion(v);
        setConfigDir(dir);
      } catch (error) {
        setBridgeError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  const handleMetrics = useCallback((m: CanvasMetrics) => setMetrics(m), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>LeatherCAD</h1>
        <span className="app-subtitle">pattern design at 1:1</span>
      </header>

      <CanvasHost onMetrics={handleMetrics} />

      <footer className="app-status" data-testid="status-bar">
        {bridgeError !== null ? (
          <span className="status-error" data-testid="bridge-error">
            Platform bridge failed: {bridgeError}
          </span>
        ) : (
          <span data-testid="bridge-ok">
            v<span data-testid="app-version">{version ?? '…'}</span>
            <span className="sep">·</span>
            config <code>{configDir ?? '…'}</code>
          </span>
        )}
        <span className="status-right">
          {metrics === null
            ? 'canvas …'
            : `canvas ${Math.round(metrics.cssWidth)}×${Math.round(metrics.cssHeight)} css ` +
              `· ${metrics.backingWidth}×${metrics.backingHeight} backing · dpr ${metrics.dpr}`}
        </span>
      </footer>
    </div>
  );
}
