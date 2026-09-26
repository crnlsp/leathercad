import { type DocumentStore } from '@leathercad/document';
import {
  describeProblem,
  diagnose,
  evaluate,
  sameProblem,
  type Problem,
  type Project,
} from '@leathercad/domain';
import {
  layoutSheets,
  pieceAt,
  sheetLabel,
  sheetsView,
  tapeJoins,
  type SheetPlan,
  type SheetsLayer,
} from '@leathercad/export';
import { PathOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { FONT_FAMILY } from '@leathercad/typography';
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
  createMeasureTool,
  createScaleTool,
  createSelectTool,
  createTextTool,
  hitTest,
  type DrawMode,
  type HardwareOptions,
  type PointerInput,
} from '@leathercad/editor';
import {
  DEFAULT_RULER_STYLE,
  GROUND,
  SHEET,
  buildDisplayList,
  clearCanvas,
  renderDisplayList,
  renderGrid,
  renderRulers,
} from '@leathercad/render';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { sheetPlanFor } from './sheets.js';

/**
 * The canvas's viewport, as much of it as anything outside may touch.
 *
 * The viewport lives in here and nothing else may move it: no panel reaches for
 * a transform, and there is no second idea of where the view is. What a caller
 * has is a millimetre rectangle and a request to show it — which is the whole
 * vocabulary zoom-to-problem needs.
 *
 * This is **navigation**, not a command moving the view. The maker clicked a
 * problem and asked to be taken to it. Whether creating a part should move the
 * view is a different question, still deferred.
 */
/** Margin left around anything the view is asked to frame, in device pixels. */
const FIT_PADDING_PX = 60;

/** How far a press may wander, in CSS pixels, and still be a click on the Sheets view. */
const CLICK_SLOP_PX = 4;

/**
 * The two views of one pattern (7.4c): **Design**, the maker's board, and
 * **Sheets**, the same pieces as the sheet plan puts them on paper. View
 * state: never saved, never part of the document.
 */
export type CanvasView = 'design' | 'sheets';

export interface CanvasHandle {
  /** Frames a millimetre rectangle, leaving the usual margin. */
  frame(bounds: Rect): void;
  /** *View › Zoom In / Out* (8.4b): zooms the current view about its centre. */
  zoom(factor: number): void;
  /** *View › Fit to Pattern* (8.4b): what a double-click on empty board does. */
  fit(): void;
}

export interface CanvasStatus {
  readonly cursorMm: Vec2 | null;
  readonly scale: number;
  /** Why the active tool is not doing what it was asked, shown in the status bar. */
  readonly notice: Problem | null;
  /** On the Sheets view, the sheet under the pointer: "Sheet 2 of 3" (7.4d). */
  readonly sheet: string | null;
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
  view,
  hoveredPart = null,
  onHoverPart,
  toolId,
  drawAs,
  hardware,
  requestDelete,
  nextId,
  onStatus,
  ref,
  children,
}: {
  store: DocumentStore;
  view: CanvasView;
  /** A part hovered in Parts, haloed on its sheets (7.4d). */
  hoveredPart?: string | null;
  /** The part under the pointer on the Sheets view, for Parts to highlight. */
  onHoverPart?: (partId: string | null) => void;
  toolId: string;
  drawAs: DrawMode;
  hardware: HardwareOptions;
  requestDelete: (ids: readonly string[]) => void;
  nextId: () => string;
  onStatus?: (status: CanvasStatus) => void;
  ref?: React.Ref<CanvasHandle>;
  /** Drawn over the canvas without taking space from it: the legend (F.7). */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>(new Viewport());
  /**
   * The Sheets view's own camera (7.4c), so going to the sheets and back finds
   * the board exactly where it was left. The tool manager only ever sees the
   * design one.
   */
  const sheetsViewportRef = useRef<Viewport>(new Viewport());
  const viewRef = useRef<CanvasView>(view);
  viewRef.current = view;
  /** The sheets' extent the Sheets camera was last fitted to: a new one frames again. */
  const sheetsFramedRef = useRef<string | null>(null);
  const sheetsCacheRef = useRef<SheetsCache | null>(null);
  /** The camera for whichever view is showing. */
  const camera = useCallback(
    (): Viewport =>
      viewRef.current === 'sheets' ? sheetsViewportRef.current : viewportRef.current,
    [],
  );
  const dirtyRef = useRef(true);
  const frameRef = useRef(0);
  const hasFittedRef = useRef(false);
  /** Where the canvas last sat in the window, so a resize can hold the drawing still. */
  const placedRef = useRef<{ left: number; top: number; dpr: number } | null>(null);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const [cursorMm, setCursorMm] = useState<Vec2 | null>(null);
  /**
   * The same pointer, for the painter: the rulers' cursor tick (§9.2). A ref,
   * because painting reads it and must not wait for React.
   */
  const pointerRef = useRef<Vec2 | null>(null);
  /** The feature a click would pick, for the hover halo (§8.4). */
  const hoveredRef = useRef<string | null>(null);
  /** On the Sheets view, the part under the pointer (7.4d). */
  const hoveredPartRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<Problem | null>(null);
  /** On the Sheets view: the sheet under the pointer, for the status bar. */
  const [sheetUnder, setSheetUnder] = useState<string | null>(null);
  /** Where a press on the Sheets view began, and on which piece. */
  const pressRef = useRef<{ x: number; y: number; partId: string | null; moved: boolean } | null>(
    null,
  );
  /** A piece dragged on the Sheets view: said beside the pointer, never moved. */
  const [sheetsNotice, setSheetsNotice] = useState(false);
  const hoveredPartPropRef = useRef<string | null>(hoveredPart);
  const onHoverPartRef = useRef(onHoverPart);
  useEffect(() => {
    hoveredPartPropRef.current = hoveredPart;
    onHoverPartRef.current = onHoverPart;
    dirtyRef.current = true;
  }, [hoveredPart, onHoverPart]);
  /** Where the pointer is over the canvas, in CSS pixels — where a notice is said. */
  const [pointerCss, setPointerCss] = useState<{ x: number; y: number } | null>(null);

  const invalidate = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (viewRef.current === 'sheets') {
      const viewport = sheetsViewportRef.current;
      const extent = layoutSheets(sheetPlanFor(store.getState().document.project)).extent;
      viewport.fitTo(extent, FIT_PADDING_PX * viewport.dpr);
      invalidate();
      return;
    }
    const resolved = evaluate(store.getState().document.project);
    const boxes = resolved.parts
      .flatMap((part) => part.features)
      .flatMap((entry) => (entry.ok ? [PathOps.bbox(entry.path)] : []))
      .filter((box): box is NonNullable<typeof box> => box !== null);

    viewportRef.current.fitTo(
      RectOps.unionAll(boxes) ?? RectOps.fromCorners({ x: 0, y: 0 }, { x: 120, y: 90 }),
      FIT_PADDING_PX * viewportRef.current.dpr,
    );
    invalidate();
  }, [store, invalidate]);

  useImperativeHandle(
    ref,
    (): CanvasHandle => ({
      frame(bounds) {
        // The same padding the double-click fit uses, so being taken to a
        // problem looks like being taken to a part.
        viewportRef.current.fitTo(bounds, FIT_PADDING_PX * viewportRef.current.dpr);
        invalidate();
      },
      zoom(factor) {
        const viewport = camera();
        viewport.zoomAt({ x: viewport.widthPx / 2, y: viewport.heightPx / 2 }, factor);
        invalidate();
      },
      fit: handleDoubleClick,
    }),
    [camera, handleDoubleClick, invalidate],
  );

  // Settings the tools read at the moment they act. Refs rather than props
  // because the ToolContext below is built once and must not be rebuilt — a
  // new manager mid-drag would lose the half-drawn shape.
  const drawAsRef = useRef(drawAs);
  drawAsRef.current = drawAs;
  const hardwareRef = useRef(hardware);
  hardwareRef.current = hardware;
  const requestDeleteRef = useRef(requestDelete);
  requestDeleteRef.current = requestDelete;

  const tools = useMemo(
    () => [
      createSelectTool(),
      createRectangleTool(nextId),
      createCircleTool(nextId),
      createArcTool(nextId),
      createLineTool(nextId),
      createPolylineTool(nextId),
      createHardwareTool(nextId, () => hardwareRef.current),
      createTextTool(nextId),
      // Linear only in 4.10a; the kind is fixed rather than chosen, because a
      // mode that asked would be a mode with more than one result (X4).
      createMeasureTool(nextId, () => 'aligned'),
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
        requestDelete: (ids) => requestDeleteRef.current(ids),
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

  // Changing view: nothing the tool had under way carries across, and the
  // view repaints on its own camera.
  useEffect(() => {
    managerRef.current?.pointerLeave();
    hoveredRef.current = null;
    hoveredPartRef.current = null;
    invalidate();
  }, [view, invalidate]);

  // The first frame can be painted before the vendored typeface has loaded,
  // which would leave the captions in a fallback face. Repaint once it is
  // here. The positions never change — they come from the layout, not from
  // the browser — so this only affects the letterforms.
  useEffect(() => {
    void document.fonts.load(`16px "${FONT_FAMILY}"`).then(
      () => invalidate(),
      () => undefined,
    );
  }, [invalidate]);

  /**
   * The Sheets view (7.4c): the sheet plan the PDF writes, drawn as its paper.
   * No grid and no rulers — sheet positions are not the maker's to measure or
   * edit — and no tool overlay, because no tool acts here.
   */
  const paintSheets = useCallback(
    (context: CanvasRenderingContext2D) => {
      const viewport = sheetsViewportRef.current;
      const { document, selection } = store.getState();
      const plan = sheetPlanFor(document.project);
      const layout = layoutSheets(plan);

      // Framed when first shown, and again when the paper's extent changes —
      // a new paper or a new sheet — otherwise the maker's camera stays.
      const extent = layout.extent;
      const key = [extent.minX, extent.minY, extent.maxX, extent.maxY].join(',');
      if (sheetsFramedRef.current !== key) {
        sheetsFramedRef.current = key;
        viewport.fitTo(extent, FIT_PADDING_PX * viewport.dpr);
      }

      const selected = selectedParts(document.project, selection);
      const cached = sheetsCacheRef.current;
      const layers =
        cached !== null &&
        cached.plan === plan &&
        cached.selected === selectedKey(selected) &&
        cached.hovered === (hoveredPartRef.current ?? hoveredPartPropRef.current) &&
        cached.dpr === viewport.dpr
          ? cached.layers
          : sheetsView(plan, layout, {
              dpr: viewport.dpr,
              now: new Date(),
              selected,
              hovered: hoveredPartRef.current ?? hoveredPartPropRef.current,
            });
      sheetsCacheRef.current = {
        plan,
        selected: selectedKey(selected),
        hovered: hoveredPartRef.current ?? hoveredPartPropRef.current,
        dpr: viewport.dpr,
        layers,
      };

      const view = viewport.toView();
      clearCanvas(context, view, SHEET.ground);
      for (const layer of layers) {
        renderDisplayList(
          context,
          layer.list,
          view,
          layer.clipMm === null ? {} : { clipMm: layer.clipMm },
        );
      }
    },
    [store],
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || context === null || context === undefined) return;

    if (viewRef.current === 'sheets') {
      paintSheets(context);
      return;
    }

    const viewport = viewportRef.current;
    const view = viewport.toView();
    const { document, selection } = store.getState();

    // Layer order matters: the wipe happens once, and each layer afterwards
    // only adds to what is already there.
    // The whole viewport is the light drafting ground (UI Foundations §5.2).
    clearCanvas(context, view, GROUND.ground);
    renderGrid(context, view);
    renderDisplayList(
      context,
      buildDisplayList(evaluate(document.project), {
        selected: selection.features,
        hovered: hoveredRef.current,
        // The same list the panels read (X7), so a feature that failed is
        // marked here instead of silently disappearing.
        diagnostics: diagnose(document.project),
        // The zoom band: how much detail the drawing carries at this scale.
        pxPerMm: view.scale,
      }),
      view,
    );
    // Where a taped piece's sheets will join (7.4b): screen furniture read from
    // the sheet plan the PDF writes, over the pattern and under the tool.
    renderDisplayList(
      context,
      tapeJoins(sheetPlanFor(document.project), { dpr: viewport.dpr }),
      view,
    );
    // The tool overlay is ephemeral feedback and never touches the document.
    renderDisplayList(context, managerRef.current?.overlay() ?? { items: [] }, view);
    // A tool builds a fresh problem on every pointer move. Keeping the old one
    // when it says the same thing stops the chrome re-rendering every frame.
    const next = managerRef.current?.notice() ?? null;
    setNotice((current) => (sameProblem(current, next) ? current : next));
    renderRulers(
      context,
      view,
      {
        ...DEFAULT_RULER_STYLE,
        thicknessPx: DEFAULT_RULER_STYLE.thicknessPx * viewport.dpr,
        leftThicknessPx: DEFAULT_RULER_STYLE.leftThicknessPx * viewport.dpr,
        fontPx: DEFAULT_RULER_STYLE.fontPx * viewport.dpr,
      },
      pointerRef.current,
    );
  }, [store, paintSheets]);

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
      const { width, height, left, top } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // The drawing stays where it is in the window whatever moves the canvas's
      // edges — the drawer, the rail, a breakpoint, the window (F.3). Only the
      // first sizing, and a change of pixel density, simply resize.
      const placed = placedRef.current;
      for (const viewport of [viewportRef.current, sheetsViewportRef.current]) {
        if (placed !== null && placed.dpr === dpr) {
          viewport.reframe(canvas.width, canvas.height, {
            x: (left - placed.left) * dpr,
            y: (top - placed.top) * dpr,
          });
        } else {
          viewport.resize(canvas.width, canvas.height, dpr);
        }
      }
      placedRef.current = { left, top, dpr };

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
    onStatus?.({ cursorMm, scale: viewportRef.current.scale, notice, sheet: sheetUnder });
  }, [cursorMm, notice, onStatus, sheetUnder]);

  // Keyboard goes to the document: the canvas is not focusable and Escape or
  // Delete should work wherever the pointer happens to be.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      // Never steal keys from a text field.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      // Ctrl on Linux and Windows, Cmd on macOS — as the menu shows it.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      // No tool acts on the Sheets view: Delete there must not delete.
      if (viewRef.current === 'sheets') return;

      const claimed = managerRef.current?.key({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
      });
      // A key the tool claimed is not also a shortcut: the app's tool keys
      // skip an event whose default is prevented.
      if (claimed === true) event.preventDefault();
    };

    // On the document, which a key bubbles through before the window: the tool
    // hears it before the app's shortcuts do, and a dialog that stops a key
    // still stops it before either.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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

  /** The sheet and piece under an event on the Sheets view. */
  const pickOnSheets = useCallback(
    (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): { sheet: string | null; partId: string | null } => {
      const viewport = sheetsViewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const at = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);
      const plan = sheetPlanFor(store.getState().document.project);
      const hit = pieceAt(plan, layoutSheets(plan), at);
      return hit === null
        ? { sheet: null, partId: null }
        : { sheet: sheetLabel(hit.sheet + 1, plan.sheets.length), partId: hit.partId };
    },
    [store],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      const viewport = camera();
      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = {
        x: (event.clientX - rect.left) * viewport.dpr,
        y: (event.clientY - rect.top) * viewport.dpr,
      };
      viewport.zoomAt(anchor, Math.exp(-event.deltaY * 0.0015));
      setCursorMm(viewRef.current === 'sheets' ? null : viewport.toWorld(anchor));
      invalidate();
    },
    [camera, invalidate],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);

      // Middle button pans, so the left button belongs to the active tool. On
      // the Sheets view no tool acts, so any button pans the paper.
      if (event.button === 1 || event.altKey || viewRef.current === 'sheets') {
        panningRef.current = { x: event.clientX, y: event.clientY };
        if (viewRef.current === 'sheets' && event.button === 0) {
          pressRef.current = {
            x: event.clientX,
            y: event.clientY,
            partId: pickOnSheets(event).partId,
            moved: false,
          };
        }
        return;
      }
      managerRef.current?.pointerDown(toInput(event));
    },
    [pickOnSheets, toInput],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const viewport = camera();
      const panning = panningRef.current;

      const rect = event.currentTarget.getBoundingClientRect();
      const raw = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);
      setPointerCss({ x: event.clientX - rect.left, y: event.clientY - rect.top });

      if (panning !== null) {
        const press = pressRef.current;
        if (press !== null && !press.moved) {
          const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP_PX;
          if (far) {
            press.moved = true;
            // Pressed on a piece and dragged: the piece stays where the plan
            // put it, and the maker is told why.
            if (press.partId !== null) setSheetsNotice(true);
          }
        }
        viewport.panByPx(
          (event.clientX - panning.x) * viewport.dpr,
          (event.clientY - panning.y) * viewport.dpr,
        );
        panningRef.current = { x: event.clientX, y: event.clientY };
        invalidate();
        setCursorMm(viewRef.current === 'sheets' ? null : raw);
        return;
      }

      if (viewRef.current === 'sheets') {
        setCursorMm(null);
        const under = pickOnSheets(event);
        setSheetUnder(under.sheet);
        if (under.partId !== hoveredPartRef.current) {
          hoveredPartRef.current = under.partId;
          onHoverPartRef.current?.(under.partId);
          invalidate();
        }
        return;
      }

      managerRef.current?.pointerMove(toInput(event));
      // The snapped point when there is one: the readout has to agree with
      // what a click would commit, or it is telling the user the wrong number
      // at exactly the moment they are relying on it.
      const at = managerRef.current?.snapPoint() ?? raw;
      setCursorMm(at);
      pointerRef.current = at;

      // Hover says what a click would pick, so only where a click picks.
      const hovered =
        managerRef.current?.activeTool.id === 'select'
          ? hitTest(evaluate(store.getState().document.project), raw, viewport.pickToleranceMm())
          : null;
      hoveredRef.current = hovered;
      invalidate();
    },
    [camera, invalidate, pickOnSheets, store, toInput],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (panningRef.current !== null) {
        panningRef.current = null;
        const press = pressRef.current;
        pressRef.current = null;
        setSheetsNotice(false);
        // A click, not a drag: select the piece's part — the same selection
        // the board and Parts show — or clear it on empty paper.
        if (viewRef.current === 'sheets' && press !== null && !press.moved) {
          const part = store
            .getState()
            .document.project.parts.find((candidate) => candidate.id === press.partId);
          // The piece's outline, so Properties shows the part — its name, how
          // many to cut, its size — as clicking it on the board would.
          const outline =
            part?.features.find(
              (feature) => feature.kind === 'cut-contour' && feature.role === 'outer',
            ) ?? part?.features[0];
          if (outline === undefined) store.clearSelection();
          else store.select([outline.id]);
        }
        return;
      }
      if (viewRef.current === 'sheets') return;
      managerRef.current?.pointerUp(toInput(event));
    },
    [store, toInput],
  );

  return (
    <div className="canvas-host" ref={containerRef}>
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        data-view={view}
        style={{
          cursor:
            view === 'sheets' ? 'default' : (managerRef.current?.activeTool.cursor ?? 'default'),
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          setCursorMm(null);
          pointerRef.current = null;
          hoveredRef.current = null;
          if (hoveredPartRef.current !== null) onHoverPartRef.current?.(null);
          hoveredPartRef.current = null;
          setSheetUnder(null);
          if (viewRef.current === 'design') managerRef.current?.pointerLeave();
          invalidate();
        }}
        onDoubleClick={handleDoubleClick}
      />
      {children}
      {sheetsNotice && pointerCss !== null && (
        <div
          className="canvas-notice"
          data-testid="sheets-notice"
          role="status"
          style={{ left: pointerCss.x + 16, top: pointerCss.y + 20 }}
        >
          LeatherCAD places pieces on sheets for you. Choose another paper to change the layout.
        </div>
      )}
      {notice !== null && pointerCss !== null && (
        <CanvasNotice
          problem={notice}
          at={pointerCss}
          bounds={{
            width: containerRef.current?.clientWidth ?? 0,
            height: containerRef.current?.clientHeight ?? 0,
          }}
        />
      )}
    </div>
  );
}

/** Room kept for the notice, so it can be turned back from the canvas edge. */
const NOTICE_WIDTH_PX = 320;
const NOTICE_HEIGHT_PX = 72;

/**
 * A refused gesture, said beside the pointer (UI Foundations §7.4).
 *
 * The status bar said it alone, 700 px from where the maker was looking — so a
 * fold drawn with nothing selected looked like a tool that did nothing. It
 * follows the pointer for as long as the tool's notice holds, and turns back
 * from the canvas edge rather than running off it. The status bar keeps saying
 * it too; this is where it is seen.
 */
function CanvasNotice({
  problem,
  at,
  bounds,
}: {
  problem: Problem;
  at: { x: number; y: number };
  bounds: { width: number; height: number };
}) {
  const right = at.x + 16 + NOTICE_WIDTH_PX > bounds.width;
  const below = at.y + 20 + NOTICE_HEIGHT_PX > bounds.height;
  return (
    <div
      className="canvas-notice"
      data-testid="canvas-notice"
      role="status"
      style={{
        left: right ? undefined : at.x + 16,
        right: right ? Math.max(8, bounds.width - at.x + 12) : undefined,
        top: below ? undefined : at.y + 20,
        bottom: below ? Math.max(8, bounds.height - at.y + 12) : undefined,
      }}
    >
      {describeProblem(problem)}
    </div>
  );
}

/** What the Sheets view last drew, so panning does not lay the sheets out again. */
interface SheetsCache {
  readonly plan: SheetPlan;
  readonly selected: string;
  readonly hovered: string | null;
  readonly dpr: number;
  readonly layers: readonly SheetsLayer[];
}

/**
 * The parts to halo on the Sheets view: selected themselves, or holding a
 * selected feature — selection is shared with the design board.
 */
function selectedParts(
  project: Project,
  selection: { readonly parts: ReadonlySet<string>; readonly features: ReadonlySet<string> },
): ReadonlySet<string> {
  return new Set(
    project.parts
      .filter(
        (part) =>
          selection.parts.has(part.id) ||
          part.features.some((feature) => selection.features.has(feature.id)),
      )
      .map((part) => part.id),
  );
}

function selectedKey(selected: ReadonlySet<string>): string {
  return [...selected].sort().join(' ');
}
