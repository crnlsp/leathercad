import { Viewport } from '@leathercad/editor';
import { RectOps, type Vec2 } from '@leathercad/geometry';
import {
  DEFAULT_GRID_STYLE,
  DEFAULT_RULER_STYLE,
  clearCanvas,
  renderDisplayList,
  renderGrid,
  renderRulers,
  type DisplayList,
} from '@leathercad/render';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface CanvasStatus {
  readonly cursorMm: Vec2 | null;
  readonly scale: number;
  readonly dpr: number;
}

/**
 * The drawing surface.
 *
 * Owns a `Viewport` and paints through the render package. React manages the
 * host element and nothing else — no reconciliation happens in the draw path,
 * because a CAD canvas repaints on every pointer move and a virtual DOM diff
 * per frame would be wasted work.
 *
 * Painting is scheduled through one requestAnimationFrame with a dirty flag,
 * so a burst of wheel events coalesces into a single repaint.
 */
export function CanvasHost({
  scene,
  initialBounds,
  onStatus,
}: {
  scene: DisplayList;
  initialBounds: { minX: number; minY: number; maxX: number; maxY: number };
  onStatus?: (status: CanvasStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>(new Viewport());
  const dirtyRef = useRef(true);
  const frameRef = useRef(0);
  const hasFittedRef = useRef(false);
  const [cursorMm, setCursorMm] = useState<Vec2 | null>(null);

  const invalidate = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || context === null || context === undefined) return;

    const viewport = viewportRef.current;
    const view = viewport.toView();

    // Layer order matters: the wipe happens once, up front, and each layer
    // afterwards only adds to what is already there.
    clearCanvas(context, view, '#101215');
    renderGrid(context, view, DEFAULT_GRID_STYLE);
    renderDisplayList(context, scene, view);
    renderRulers(context, view, {
      ...DEFAULT_RULER_STYLE,
      thicknessPx: DEFAULT_RULER_STYLE.thicknessPx * viewport.dpr,
      leftThicknessPx: DEFAULT_RULER_STYLE.leftThicknessPx * viewport.dpr,
      fontPx: DEFAULT_RULER_STYLE.fontPx * viewport.dpr,
    });
  }, [scene]);

  // One rAF loop driven by a dirty flag. A burst of wheel events therefore
  // costs one repaint, not one per event.
  useEffect(() => {
    const tick = (): void => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        paint();
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [paint]);

  // Keep the backing store matched to the CSS box and the device pixel ratio.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container === null || canvas === null) return;

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      viewportRef.current.resize(canvas.width, canvas.height, dpr);

      // Frame the content once, when the canvas first has a size.
      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        viewportRef.current.fitTo(
          RectOps.fromCorners(
            { x: initialBounds.minX, y: initialBounds.minY },
            { x: initialBounds.maxX, y: initialBounds.maxY },
          ),
          60 * dpr,
        );
      }
      invalidate();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [initialBounds, invalidate]);

  useEffect(() => {
    onStatus?.({ cursorMm, scale: viewportRef.current.scale, dpr: viewportRef.current.dpr });
  }, [cursorMm, onStatus]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = {
        x: (event.clientX - rect.left) * viewport.dpr,
        y: (event.clientY - rect.top) * viewport.dpr,
      };
      // Exponential in the wheel delta, so zooming feels the same whether the
      // input reports small continuous steps or large notched ones.
      viewport.zoomAt(anchor, Math.exp(-event.deltaY * 0.0015));
      setCursorMm(viewport.toWorld(anchor));
      invalidate();
    },
    [invalidate],
  );

  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle button or space-free left drag pans. Left drag becomes the select
    // tool in slice 3.2.
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      setCursorMm(viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top));

      const dragging = draggingRef.current;
      if (dragging !== null) {
        viewport.panByPx(
          (event.clientX - dragging.x) * viewport.dpr,
          (event.clientY - dragging.y) * viewport.dpr,
        );
        draggingRef.current = { x: event.clientX, y: event.clientY };
      }
      invalidate();
    },
    [invalidate],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    viewportRef.current.fitTo(
      RectOps.fromCorners(
        { x: initialBounds.minX, y: initialBounds.minY },
        { x: initialBounds.maxX, y: initialBounds.maxY },
      ),
      60 * viewportRef.current.dpr,
    );
    invalidate();
  }, [initialBounds, invalidate]);

  return (
    <div className="canvas-host" ref={containerRef}>
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setCursorMm(null)}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
