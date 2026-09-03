import { useEffect, useRef, useState } from 'react';

export interface CanvasMetrics {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  dpr: number;
}

/**
 * Mounts a device-pixel-ratio-aware canvas and keeps its backing store sized to
 * its CSS box.
 *
 * Getting this wrong is how a CAD canvas ends up blurry, or — worse — how
 * coordinates drift by the DPR factor. The backing store is cssSize × dpr, and
 * the base transform is set to dpr so all subsequent drawing happens in CSS
 * pixels. The real renderer (slice 2.3) layers the mm → px viewport transform
 * on top of that base and never touches it again.
 *
 * This paints only a background and a centre mark. Actual drawing arrives with
 * the display list in slice 2.3.
 */
export function CanvasHost({ onMetrics }: { onMetrics?: (m: CanvasMetrics) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metrics, setMetrics] = useState<CanvasMetrics | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container === null || canvas === null) return;

    let disposed = false;
    let dprMediaQuery: MediaQueryList | null = null;

    const resize = (): void => {
      if (disposed) return;
      const dpr = window.devicePixelRatio || 1;
      const { width: cssWidth, height: cssHeight } = container.getBoundingClientRect();
      if (cssWidth === 0 || cssHeight === 0) return;

      const backingWidth = Math.round(cssWidth * dpr);
      const backingHeight = Math.round(cssHeight * dpr);

      // Assigning width/height resets the context, so the transform below must
      // be re-applied every resize, not once at mount.
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const context = canvas.getContext('2d');
      if (context !== null) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPlaceholder(context, cssWidth, cssHeight);
      }

      const next: CanvasMetrics = { cssWidth, cssHeight, backingWidth, backingHeight, dpr };
      setMetrics(next);
      onMetrics?.(next);
    };

    // devicePixelRatio changes when the window moves between displays or the
    // user changes scaling. The matchMedia listener is one-shot, so it is
    // re-armed on each change.
    const watchDpr = (): void => {
      dprMediaQuery?.removeEventListener('change', handleDprChange);
      dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMediaQuery.addEventListener('change', handleDprChange, { once: true });
    };
    function handleDprChange(): void {
      resize();
      watchDpr();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    watchDpr();
    resize();

    return () => {
      disposed = true;
      observer.disconnect();
      dprMediaQuery?.removeEventListener('change', handleDprChange);
    };
  }, [onMetrics]);

  return (
    <div className="canvas-host" ref={containerRef}>
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        data-dpr={metrics?.dpr ?? ''}
        data-css-width={metrics === null ? '' : Math.round(metrics.cssWidth)}
        data-backing-width={metrics?.backingWidth ?? ''}
      />
    </div>
  );
}

function paintPlaceholder(
  context: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
): void {
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = '#101215';
  context.fillRect(0, 0, cssWidth, cssHeight);

  const x = Math.round(cssWidth / 2);
  const y = Math.round(cssHeight / 2);
  context.strokeStyle = '#3a4048';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x - 12, y);
  context.lineTo(x + 12, y);
  context.moveTo(x, y - 12);
  context.lineTo(x, y + 12);
  context.stroke();
}
