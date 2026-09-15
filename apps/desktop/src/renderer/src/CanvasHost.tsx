import { type DocumentStore } from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { PathOps, RectOps, type Vec2 } from '@leathercad/geometry';
import {
  ToolManager,
  Viewport,
  createArcTool,
  createCircleTool,
  createHardwareTool,
  createLineTool,
  createPolylineTool,
  createRectangleTool,
  createRotateTool,
  createScaleTool,
  createSelectTool,
  type DrawAs,
  type HardwareOptions,
  type PointerInput,
} from '@leathercad/editor';
import {
  DEFAULT_GRID_STYLE,
  DEFAULT_RULER_STYLE,
  buildDisplayList,
  clearCanvas,
  renderDisplayList,
  renderGrid,
  renderRulers,
} from '@leathercad/render';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface CanvasStatus {
  readonly cursorMm: Vec2 | null;
  readonly scale: number;
  /** The active tool's message, shown in the status bar. */
  readonly notice: string | null;
}

/**
 * The drawing surface.
 *
 * Owns the viewport and the tool manager; the document is owned by the store
 * and reached only through dispatched commands. React manages the host element
 * and nothing else — no reconciliation happens in the draw path, because a CAD
 * canvas repaints on every pointer move.
 */
export function CanvasHost({
  store,
  toolId,
  drawAs,
  hardware,
  nextId,
  onStatus,
}: {
  store: DocumentStore;
  toolId: string;
  drawAs: DrawAs;
  hardware: HardwareOptions;
  nextId: () => string;
  onStatus?: (status: CanvasStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>(new Viewport());
  const dirtyRef = useRef(true);
  const frameRef = useRef(0);
  const hasFittedRef = useRef(false);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const [cursorMm, setCursorMm] = useState<Vec2 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Settings the tools read at the moment they act. Refs rather than props
  // because the ToolContext below is built once and must not be rebuilt — a
  // new manager mid-drag would lose the half-drawn shape.
  const drawAsRef = useRef(drawAs);
  drawAsRef.current = drawAs;
  const hardwareRef = useRef(hardware);
  hardwareRef.current = hardware;

  const tools = useMemo(
    () => [
      createSelectTool(),
      createRectangleTool(nextId),
      createCircleTool(nextId),
      createArcTool(nextId),
      createLineTool(nextId),
      createPolylineTool(nextId),
      createHardwareTool(nextId, () => hardwareRef.current),
      createRotateTool(),
      createScaleTool(),
    ],
    [nextId],
  );

  const managerRef = useRef<ToolManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new ToolManager(
      {
        viewport: viewportRef.current,
        store,
        dispatch: (command) => store.dispatch(command),
        invalidate,
        drawAs: () => drawAsRef.current,
      },
      tools[0]!,
      tools,
    );
  }

  useEffect(() => {
    managerRef.current?.activate(toolId);
    invalidate();
  }, [toolId, invalidate]);

  // Any change to the document or selection means a repaint.
  useEffect(() => store.subscribe(invalidate), [store, invalidate]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || context === null || context === undefined) return;

    const viewport = viewportRef.current;
    const view = viewport.toView();
    const { document, selection } = store.getState();

    // Layer order matters: the wipe happens once, and each layer afterwards
    // only adds to what is already there.
    clearCanvas(context, view, '#101215');
    renderGrid(context, view, DEFAULT_GRID_STYLE);
    renderDisplayList(
      context,
      buildDisplayList(evaluate(document.project), { selected: selection.features }),
      view,
    );
    // The tool overlay is ephemeral feedback and never touches the document.
    renderDisplayList(context, managerRef.current?.overlay() ?? { items: [] }, view);
    setNotice(managerRef.current?.notice() ?? null);
    renderRulers(context, view, {
      ...DEFAULT_RULER_STYLE,
      thicknessPx: DEFAULT_RULER_STYLE.thicknessPx * viewport.dpr,
      leftThicknessPx: DEFAULT_RULER_STYLE.leftThicknessPx * viewport.dpr,
      fontPx: DEFAULT_RULER_STYLE.fontPx * viewport.dpr,
    });
  }, [store]);

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

      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        viewportRef.current.centreMm = { x: 60, y: 40 };
        viewportRef.current.scale = 3 * dpr;
      }

      // Paint straight away: requestAnimationFrame does not run while a window
      // is unshown or occluded, which would leave the first frame blank.
      dirtyRef.current = false;
      paint();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => {
    onStatus?.({ cursorMm, scale: viewportRef.current.scale, notice });
  }, [cursorMm, notice, onStatus]);

  // Keyboard goes to the window: the canvas is not focusable and Escape or
  // Delete should work wherever the pointer happens to be.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      // Never steal keys from a text field.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      managerRef.current?.key({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);

  const toInput = useCallback((event: React.PointerEvent<HTMLCanvasElement>): PointerInput => {
    const viewport = viewportRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const atPx = {
      x: (event.clientX - rect.left) * viewport.dpr,
      y: (event.clientY - rect.top) * viewport.dpr,
    };
    return {
      at: viewport.toWorld(atPx),
      atPx,
      button: event.button,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
    };
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = {
        x: (event.clientX - rect.left) * viewport.dpr,
        y: (event.clientY - rect.top) * viewport.dpr,
      };
      viewport.zoomAt(anchor, Math.exp(-event.deltaY * 0.0015));
      setCursorMm(viewport.toWorld(anchor));
      invalidate();
    },
    [invalidate],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);

      // Middle button pans, so the left button belongs to the active tool.
      if (event.button === 1 || event.altKey) {
        panningRef.current = { x: event.clientX, y: event.clientY };
        return;
      }
      managerRef.current?.pointerDown(toInput(event));
    },
    [toInput],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;
      const panning = panningRef.current;

      const rect = event.currentTarget.getBoundingClientRect();
      const raw = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);

      if (panning !== null) {
        viewport.panByPx(
          (event.clientX - panning.x) * viewport.dpr,
          (event.clientY - panning.y) * viewport.dpr,
        );
        panningRef.current = { x: event.clientX, y: event.clientY };
        invalidate();
        setCursorMm(raw);
        return;
      }

      managerRef.current?.pointerMove(toInput(event));
      // The snapped point when there is one: the readout has to agree with
      // what a click would commit, or it is telling the user the wrong number
      // at exactly the moment they are relying on it.
      setCursorMm(managerRef.current?.snapPoint() ?? raw);
    },
    [invalidate, toInput],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (panningRef.current !== null) {
        panningRef.current = null;
        return;
      }
      managerRef.current?.pointerUp(toInput(event));
    },
    [toInput],
  );

  const handleDoubleClick = useCallback(() => {
    const resolved = evaluate(store.getState().document.project);
    const boxes = resolved.parts
      .flatMap((part) => part.features)
      .flatMap((entry) => (entry.ok ? [PathOps.bbox(entry.path)] : []))
      .filter((box): box is NonNullable<typeof box> => box !== null);

    viewportRef.current.fitTo(
      RectOps.unionAll(boxes) ?? RectOps.fromCorners({ x: 0, y: 0 }, { x: 120, y: 90 }),
      60 * viewportRef.current.dpr,
    );
    invalidate();
  }, [store, invalidate]);

  return (
    <div className="canvas-host" ref={containerRef}>
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        style={{ cursor: managerRef.current?.activeTool.cursor ?? 'default' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setCursorMm(null)}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
