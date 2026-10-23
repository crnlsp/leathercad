import { approxEq } from '@leathercad/core';
import type { TabCamera } from '@leathercad/platform';
import {
  addGuide,
  drawnBounds,
  selectedFeatureIds,
  type DocumentStore,
} from '@leathercad/document';
import { diagnose, evaluate, sameProblem, type Problem } from '@leathercad/domain';
import {
  layoutSheets,
  pieceAt,
  sheetsView,
  tapeJoins,
  type SheetPlan,
  type SheetsLayer,
} from '@leathercad/export';
import { RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { FONT_FAMILY } from '@leathercad/typography';
import {
  ToolManager,
  createArcTool,
  createCircleTool,
  createHardwareTool,
  createLineTool,
  createPolylineTool,
  createRectangleTool,
  DEFAULT_EDIT_POINTS,
  createEditPointsTool,
  createRotateTool,
  createMeasureTool,
  createScaleTool,
  createSelectTool,
  createGuideTool,
  createTextTool,
  hitTest,
  type DrawMode,
  type EditPointsOptions,
  type HardwareOptions,
  type MakerDefaults,
  type PointerInput,
  type SizeDraft,
  type Viewport,
} from '@leathercad/editor';
import {
  CANVAS,
  DEFAULT_RULER_STYLE,
  GROUND,
  SHEET,
  buildDisplayList,
  clearCanvas,
  renderDisplayList,
  renderGrid,
  guideDisplayList,
  renderRulers,
  zoomPercent,
  type CssBox,
} from '@leathercad/render';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { captionOf } from './captionWords.js';
import { selectedParts } from './sheetContents.js';
import { sheetsWords } from './sheetWords.js';
import type { I18n } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { describeProblem } from './problemText.js';
import type { RightClicked } from './contextMenu.js';
import { sheetPlanFor } from './sheets.js';
import { IS_MAC } from './keyCaps.js';
import { commandFor, keyForTools, keysOf, matches, meaningsForTools, typesSize } from './keymap.js';
import { isTyping, pressesControl } from './shortcuts.js';
import { ValueChips, type DrawnChips, type ValueChipsHandle } from './ValueChips.js';
import { SelectionBar, type SelectionBarHandle } from './SelectionBar.js';
import type { MakerTools } from './irons.js';

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
/** Margin left around anything the view is asked to frame, in CSS pixels. */
const FIT_PADDING_PX = 60;

/** How far a press may wander, in CSS pixels, and still be a click on the Sheets view. */
const CLICK_SLOP_PX = 4;

/**
 * The two views of one pattern (7.4c): **Design**, the maker's board, and
 * **Sheets**, the same pieces as the sheet plan puts them on paper. View
 * state: never saved, never part of the document.
 */
export type CanvasView = 'design' | 'sheets';

/**
 * The board's two cameras (7.4c), kept by the tab so a project comes back
 * exactly where it was left. The canvas is made again for each tab it shows,
 * and takes these rather than new ones.
 */
export interface TabCameras {
  readonly design: Viewport;
  readonly sheets: Viewport;
  /** The design camera has been placed once: a tab shown again is not re-placed. */
  fitted: boolean;
  /** Its first placing frames the drawing: an opened project is shown whole. */
  frameDrawing: boolean;
  /**
   * Its first placing puts the board where the last session left it (8.12):
   * millimetres at the centre, and the zoom. Over `frameDrawing`.
   */
  restore: TabCamera | null;
  /** The sheets' extent the Sheets camera was last fitted to: a new one frames again. */
  sheetsFramed: string | null;
}

export interface CanvasHandle {
  /** Frames a millimetre rectangle, leaving the usual margin. */
  frame(bounds: Rect): void;
  /**
   * The zoom keys (8.4b) and − and + (U.4): the current view to the next stop
   * of the zoom ladder up or down, about its centre.
   */
  step(direction: 1 | -1): void;
  /** Zooms the current view to a percentage about its centre, 100 % being true size (U.4). */
  zoomTo(percent: number): void;
  /**
   * Shift+1 (U.4): fits the pattern, as a double-click on empty board does —
   * on the Sheets view, the sheets.
   */
  fit(): void;
  /** Frames the pattern on the Design view's camera, whichever view is showing: an opened project. */
  fitDrawing(): void;
  /**
   * Shift+2 (U.4): frames what is selected on the board, a part picked by its
   * heading included. Nothing on the Sheets view, or with nothing drawn picked.
   */
  fitSelection(): void;
  /**
   * Where a menu about the selection opens from the keyboard (8.8), in CSS
   * pixels of the window: the middle of what is selected, when it is on the
   * board in view, otherwise the middle of the canvas.
   */
  selectionPoint(): { x: number; y: number } | null;
  /**
   * F6 (U.17): focus into the selection bar, or out of it to the board.
   * False when there is no bar in view to go to.
   */
  toggleSelectionBar(): boolean;
}

export interface CanvasStatus {
  readonly cursorMm: Vec2 | null;
  /**
   * The showing view's zoom, 100 % being true size (U.4): its own camera's,
   * Design's or the Sheets', sent whenever that camera changes.
   */
  readonly zoomPercent: number;
  /** Why the active tool is not doing what it was asked, shown in the status bar. */
  readonly notice: Problem | null;
  /** On the Sheets view, the sheet under the pointer, 1-based, and how many there are (7.4d). */
  readonly sheet: { readonly number: number; readonly count: number } | null;
  /** The rectangle being drawn and its sizes, while one is (U.16): Properties mirrors them. */
  readonly sizing: SizeDraft | null;
  /** A shape is between its clicks (U.11): the work bar offers Esc, and the keys of that run. */
  readonly underway: boolean;
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
  onToolChange,
  drawAs,
  makerDefaults,
  hardware,
  pointOptions = DEFAULT_EDIT_POINTS,
  requestDelete,
  requestDeletePart,
  onContextMenu,
  nextId,
  onStatus,
  panelOver = null,
  selectionBar = null,
  cameras,
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
  onToolChange: (id: string) => void;
  drawAs: DrawMode;
  /** The maker's margin and leather (U.13): what *Stitch + allowance* and a new fold take. */
  makerDefaults: MakerDefaults;
  hardware: HardwareOptions;
  /** The corner radius Edit Points rounds to (3.9d). */
  pointOptions?: EditPointsOptions;
  requestDelete: (ids: readonly string[]) => void;
  /** The Delete key on a part picked by its heading (Q29). */
  requestDeletePart: (partId: string) => void;
  /** A right-click on a feature (8.8): the app selects it, unless it already is, and opens the menu. */
  onContextMenu?: (clicked: RightClicked, at: { x: number; y: number }) => void;
  nextId: () => string;
  onStatus?: (status: CanvasStatus) => void;
  /** A panel open over the board (U.5), by its class: the value chips keep clear of it. */
  panelOver?: string | null;
  /**
   * The selection bar's My tools, which its step makes things with (U.17);
   * null when Settings › Appearance turns the bar off, which leaves nothing.
   */
  selectionBar?: MakerTools | null;
  /**
   * The project's cameras, which its tab keeps (8.12): the canvas is made
   * again for each tab it shows, and the board comes back where it was left.
   */
  cameras: TabCameras;
  ref?: React.Ref<CanvasHandle>;
  /** Drawn over the canvas without taking space from it: the legend (F.7). */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The tab's, read once: the canvas is keyed by its tab, so they never change under it.
  const camerasRef = useRef(cameras);
  const viewportRef = useRef<Viewport>(cameras.design);
  /**
   * The Sheets view's own camera (7.4c), so going to the sheets and back finds
   * the board exactly where it was left. The tool manager only ever sees the
   * design one.
   */
  const sheetsViewportRef = useRef<Viewport>(cameras.sheets);
  const viewRef = useRef<CanvasView>(view);
  viewRef.current = view;
  const sheetsCacheRef = useRef<SheetsCache | null>(null);
  /** The camera for whichever view is showing. */
  const camera = useCallback(
    (): Viewport =>
      viewRef.current === 'sheets' ? sheetsViewportRef.current : viewportRef.current,
    [],
  );
  const dirtyRef = useRef(true);
  const frameRef = useRef(0);
  /** Where the canvas last sat in the window, so a resize can hold the drawing still. */
  const placedRef = useRef<{ left: number; top: number; dpr: number } | null>(null);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const rulerGuideRef = useRef<{ id: string; angleRad: number } | null>(null);
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
  /** The rectangle being drawn, which the chips and Properties show the sizes of (U.16). */
  const [drawing, setDrawing] = useState<SizeDraft | null>(null);
  const [underway, setUnderway] = useState(false);
  /**
   * The showing camera's zoom (U.4), read as each frame is painted — every
   * change to a camera repaints, whatever made it: the wheel, a key, the zoom
   * control, a fit, a resize, the Sheets view framing its paper, a change of
   * view. Sent with the status, which once carried the Design camera's scale
   * alone and only when the pointer moved.
   */
  const [zoom, setZoom] = useState(() => zoomPercent(viewportRef.current.toView()));
  const i18n = useI18n();
  const { t } = i18n;
  /** The interface's words, which the board's captions are in, as the next paint reads them. */
  const i18nRef = useRef(i18n);
  useEffect(() => {
    i18nRef.current = i18n;
    dirtyRef.current = true;
  }, [i18n]);
  /** On the Sheets view: the sheet under the pointer, for the status bar. */
  const [sheetUnder, setSheetUnder] = useState<CanvasStatus['sheet']>(null);
  /** Where a press on the Sheets view began, and on which piece. */
  const pressRef = useRef<{ x: number; y: number; partId: string | null; moved: boolean } | null>(
    null,
  );
  /** A piece dragged on the Sheets view: said beside the pointer, never moved. */
  const [sheetsNotice, setSheetsNotice] = useState(false);
  /**
   * The container's size in CSS pixels, for turning the notice back from the
   * canvas edge. State, set by the resize observer, rather than read off
   * `containerRef` during render: a ref read there only updates when
   * something else happens to re-render, so a resize left the notice
   * measuring the old canvas (Q3).
   */
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
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

  /** The selected outline's sizes, beside it (U.14): placed as each frame is painted. */
  const chipsRef = useRef<ValueChipsHandle>(null);
  /** The bar under the selected piece (U.17): placed after the chips, clear of them. */
  const barRef = useRef<SelectionBarHandle>(null);
  /** What typing into a chip does to the shape being drawn: the tool's, never the document's. */
  const drawn = useMemo(
    (): DrawnChips => ({
      read: () => managerRef.current?.sizing() ?? null,
      set: (field, value) => {
        managerRef.current?.setSize(field, value);
        dirtyRef.current = true;
      },
      finish: () => {
        managerRef.current?.finishSizing();
        dirtyRef.current = true;
      },
      cancel: () => {
        managerRef.current?.key({
          key: 'Escape',
          means: new Set(),
          shiftKey: false,
          ctrlKey: false,
        });
        dirtyRef.current = true;
      },
    }),
    [],
  );
  /** The keys back to the board, without scrolling the window to it. */
  const toBoard = useCallback(() => canvasRef.current?.focus({ preventScroll: true }), []);
  const panelOverRef = useRef(panelOver);
  useEffect(() => {
    panelOverRef.current = panelOver;
    invalidate();
  }, [panelOver, invalidate]);
  /**
   * Where on the board the chips may sit, as it is laid out now: the canvas,
   * less a panel open over one side of it, and clear of the controls laid over
   * it — the legend, the zoom control, whatever says `data-over-board`.
   */
  const chipRoom = useCallback((): { area?: CssBox; obstacles: CssBox[] } => {
    const canvas = canvasRef.current;
    if (canvas === null) return { obstacles: [] };
    const board = canvas.getBoundingClientRect();
    const onBoard = (rect: DOMRect): CssBox => ({
      left: rect.left - board.left,
      top: rect.top - board.top,
      right: rect.right - board.left,
      bottom: rect.bottom - board.top,
    });
    const obstacles = [...(containerRef.current?.querySelectorAll('[data-over-board]') ?? [])].map(
      (control) => onBoard(control.getBoundingClientRect()),
    );
    const over = panelOverRef.current;
    const panel = over === null ? null : document.querySelector(`.panel.${over}`);
    if (panel === null) return { obstacles };
    const covered = panel.getBoundingClientRect();
    const fromLeft = covered.left + covered.width / 2 < board.left + board.width / 2;
    return {
      area: {
        left: fromLeft ? covered.right - board.left : 0,
        top: 0,
        right: fromLeft ? board.width : covered.left - board.left,
        bottom: board.height,
      },
      obstacles,
    };
  }, []);
  // A control that changes size without the board changing — the legend
  // folding to its chip — places the chips again.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const observer = new ResizeObserver(() => invalidate());
    for (const control of container.querySelectorAll('[data-over-board]'))
      observer.observe(control);
    return () => observer.disconnect();
  }, [view, invalidate]);

  const fitDrawing = useCallback(() => {
    viewportRef.current.fitTo(
      drawnBounds(evaluate(store.getState().document.project)) ??
        RectOps.fromCorners({ x: 0, y: 0 }, { x: 120, y: 90 }),
      FIT_PADDING_PX * viewportRef.current.dpr,
    );
    invalidate();
  }, [store, invalidate]);

  const handleDoubleClick = useCallback(() => {
    if (viewRef.current === 'sheets') {
      const viewport = sheetsViewportRef.current;
      const extent = layoutSheets(sheetPlanFor(store.getState().document.project)).extent;
      viewport.fitTo(extent, FIT_PADDING_PX * viewport.dpr);
      invalidate();
      return;
    }
    fitDrawing();
  }, [store, invalidate, fitDrawing]);

  /** What is selected, as the board draws it: a part picked by its heading is all of it (Q29). */
  const selectionBounds = useCallback((): Rect | null => {
    const { document, selection } = store.getState();
    return drawnBounds(
      evaluate(document.project),
      new Set(selectedFeatureIds(document.project, selection)),
    );
  }, [store]);

  useImperativeHandle(
    ref,
    (): CanvasHandle => ({
      frame(bounds) {
        // The same padding the double-click fit uses, so being taken to a
        // problem looks like being taken to a part.
        viewportRef.current.fitTo(bounds, FIT_PADDING_PX * viewportRef.current.dpr);
        invalidate();
      },
      step(direction) {
        camera().stepZoom(direction);
        invalidate();
      },
      zoomTo(percent) {
        camera().zoomToPercent(percent);
        invalidate();
      },
      fit: handleDoubleClick,
      fitDrawing,
      fitSelection() {
        if (viewRef.current === 'sheets') return;
        const box = selectionBounds();
        if (box === null) return;
        viewportRef.current.fitTo(box, FIT_PADDING_PX * viewportRef.current.dpr);
        invalidate();
      },
      selectionPoint() {
        const canvas = canvasRef.current;
        if (canvas === null) return null;
        const rect = canvas.getBoundingClientRect();
        const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        if (viewRef.current === 'sheets') return middle;

        const box = selectionBounds();
        if (box === null) return middle;

        const viewport = viewportRef.current;
        const at = viewport.toScreen({
          x: (box.minX + box.maxX) / 2,
          y: (box.minY + box.maxY) / 2,
        });
        const x = rect.left + at.x / viewport.dpr;
        const y = rect.top + at.y / viewport.dpr;
        const inView = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        return inView ? { x, y } : middle;
      },
      toggleSelectionBar() {
        if (viewRef.current === 'sheets') return false;
        return barRef.current?.toggleFocus() ?? false;
      },
    }),
    [camera, handleDoubleClick, fitDrawing, invalidate, selectionBounds],
  );

  // Settings the tools read at the moment they act. Refs rather than props
  // because the ToolContext below is built once and must not be rebuilt — a
  // new manager mid-drag would lose the half-drawn shape.
  const drawAsRef = useRef(drawAs);
  drawAsRef.current = drawAs;
  const makerDefaultsRef = useRef(makerDefaults);
  makerDefaultsRef.current = makerDefaults;
  const hardwareRef = useRef(hardware);
  hardwareRef.current = hardware;
  const pointOptionsRef = useRef(pointOptions);
  pointOptionsRef.current = pointOptions;
  const requestDeleteRef = useRef(requestDelete);
  requestDeleteRef.current = requestDelete;
  const requestDeletePartRef = useRef(requestDeletePart);
  requestDeletePartRef.current = requestDeletePart;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  const tools = useMemo(
    () => [
      createSelectTool(),
      createGuideTool(nextId),
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
      createEditPointsTool(() => pointOptionsRef.current),
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
        makerDefaults: () => makerDefaultsRef.current,
        requestDelete: (ids) => requestDeleteRef.current(ids),
        requestDeletePart: (partId) => requestDeletePartRef.current(partId),
      },
      tools[0]!,
      tools,
    );
  }

  // The pointer the tool asks for, from the tool the props name. Not
  // `managerRef.current.activeTool`: the manager only switches in the effect
  // below, after this render, so reading it here showed the previous tool's
  // cursor until something else re-rendered (Q3).
  const toolCursor = tools.find((tool) => tool.id === toolId)?.cursor ?? 'default';

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
  // which would leave the board's words in a fallback face. Repaint once every
  // weight the canvas sets is here: Regular, and the Medium and SemiBold of the
  // captions and values (R-01), which only the interface's own text loaded.
  // The positions never change, so this only affects the letterforms.
  useEffect(() => {
    void Promise.all(
      [CANVAS.text.meta, CANVAS.text.value, CANVAS.text.name].map(({ weight }) =>
        document.fonts.load(`${String(weight)} 16px "${FONT_FAMILY}"`),
      ),
    ).then(
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
      if (camerasRef.current.sheetsFramed !== key) {
        camerasRef.current.sheetsFramed = key;
        viewport.fitTo(extent, FIT_PADDING_PX * viewport.dpr);
      }

      const selected = selectedParts(document.project, selection);
      const cached = sheetsCacheRef.current;
      const layers =
        cached !== null &&
        cached.plan === plan &&
        cached.i18n === i18nRef.current &&
        cached.selected === selectedKey(selected) &&
        cached.hovered === (hoveredPartRef.current ?? hoveredPartPropRef.current)
          ? cached.layers
          : sheetsView(plan, layout, {
              now: new Date(),
              selected,
              hovered: hoveredPartRef.current ?? hoveredPartPropRef.current,
              words: sheetsWords(i18nRef.current),
            });
      sheetsCacheRef.current = {
        plan,
        i18n: i18nRef.current,
        selected: selectedKey(selected),
        hovered: hoveredPartRef.current ?? hoveredPartPropRef.current,
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
      // After painting: the sheets frame themselves when first shown.
      setZoom(zoomPercent(sheetsViewportRef.current.toView()));
      return;
    }

    const viewport = viewportRef.current;
    const view = viewport.toView();
    setZoom(zoomPercent(view));
    const { document, selection } = store.getState();

    // Layer order matters: the wipe happens once, and each layer afterwards
    // only adds to what is already there.
    // The whole viewport is the light drafting ground (UI Foundations §5.2).
    clearCanvas(context, view, GROUND.ground);
    renderGrid(context, view);
    renderDisplayList(
      context,
      guideDisplayList(document.project.guides ?? [], view, selection.guide),
      view,
    );
    renderDisplayList(
      context,
      buildDisplayList(evaluate(document.project), {
        // A part picked by its heading shows as picked (Q30): Rotate turns it,
        // so the board has to say what will turn.
        selected:
          selection.parts.size === 0
            ? selection.features
            : new Set(selectedFeatureIds(document.project, selection)),
        hovered: hoveredRef.current,
        // The same list the panels read (X7), so a feature that failed is
        // marked here instead of silently disappearing.
        diagnostics: diagnose(document.project),
        // The camera: how much detail the drawing carries at this zoom, the
        // same on any display (U.1), and where the board's words go — a
        // caption pins to the top-left once it would run under the ruler (R-01).
        view,
        // Each piece's caption, in the interface's words (ADR 0018).
        caption: (part) => captionOf(i18nRef.current, part),
      }),
      view,
    );
    // The selected outline's dimension lines, under its value chips (U.14):
    // screen furniture like the rest of this, never printed.
    const room = chipRoom();
    const chips = chipsRef.current?.place(view, room) ?? null;
    if (chips !== null) renderDisplayList(context, chips.lines, view);
    // Under the piece and its chips (U.17), and away while a drag or a shape
    // is under way: it would only cover what the maker is moving.
    barRef.current?.place(
      view,
      room,
      chips?.taken ?? [],
      store.inTransaction || (managerRef.current?.underway() ?? false),
    );
    // Where a taped piece's sheets will join (7.4b): screen furniture read from
    // the sheet plan the PDF writes, over the pattern and under the tool.
    renderDisplayList(context, tapeJoins(sheetPlanFor(document.project)), view);
    // The tool overlay is ephemeral feedback and never touches the document.
    renderDisplayList(context, managerRef.current?.overlay() ?? { items: [] }, view);
    // A tool builds a fresh problem on every pointer move. Keeping the old one
    // when it says the same thing stops the chrome re-rendering every frame.
    const next = managerRef.current?.notice() ?? null;
    setNotice((current) => (sameProblem(current, next) ? current : next));
    // The shape being typed over, for the chips and for Properties (U.16): set
    // only when a number moved, not on every frame.
    const sizing = managerRef.current?.sizing() ?? null;
    setDrawing((current) => (sameDraft(current, sizing) ? current : sizing));
    setUnderway(managerRef.current?.underway() ?? false);
    renderRulers(context, view, DEFAULT_RULER_STYLE, pointerRef.current);
  }, [store, paintSheets, chipRoom]);

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
      const { clientWidth, clientHeight } = container;
      setContainerSize((current) =>
        current.width === clientWidth && current.height === clientHeight
          ? current
          : { width: clientWidth, height: clientHeight },
      );

      // A tab's first showing (8.12): where the last session left it, an
      // opened project framed whole, a new one at the usual place. Shown
      // again, it is wherever it was left.
      if (!camerasRef.current.fitted) {
        camerasRef.current.fitted = true;
        const restore = camerasRef.current.restore;
        if (restore !== null) {
          viewportRef.current.centreMm = { x: restore.x, y: restore.y };
          viewportRef.current.zoomToPercent(restore.percent);
        } else if (camerasRef.current.frameDrawing) {
          fitDrawing();
        } else {
          viewportRef.current.centreMm = { x: 60, y: 40 };
          viewportRef.current.scale = 3 * dpr;
        }
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
  }, [paint, fitDrawing]);

  useEffect(() => {
    onStatus?.({
      cursorMm,
      zoomPercent: zoom,
      notice,
      sheet: sheetUnder,
      sizing: drawing,
      underway,
    });
  }, [cursorMm, notice, onStatus, sheetUnder, zoom, drawing, underway]);

  // Keyboard goes to the document: the board is one Tab stop (U.14), but
  // Escape or Delete should work wherever focus and the pointer happen to be.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Never steal keys from a field, a list or anything editable (8.7), nor
      // a focused button's Space (U.12).
      if (isTyping(event.target) || pressesControl(event)) return;
      if (event.key === 'Escape' && rulerGuideRef.current !== null) {
        rulerGuideRef.current = null;
        store.rollback();
        event.preventDefault();
        return;
      }

      // Ctrl on Linux and Windows, ⌘ on macOS: the keymap's (U.3).
      const command = commandFor(event, IS_MAC);
      const onSheets = viewRef.current === 'sheets';

      // A number typed with the board focused while a rectangle is being drawn,
      // or about to be, goes into its first chip (U.16, R-13): the key lands
      // there, and Tab, Enter and Esc are the chips'. With no corner placed the
      // shape starts at the pointer.
      if (
        !onSheets &&
        typesSize(event) &&
        (event.target === document.body || event.target === canvasRef.current) &&
        managerRef.current?.beginSizing() === true
      ) {
        // The chips exist and are placed before the key goes to one of them.
        flushSync(() => setDrawing(managerRef.current?.sizing() ?? null));
        paint();
        // Not prevented: the key is typed into the chip that has the focus now.
        if (chipsRef.current?.open() === true) return;
      }

      // No tool acts on the Sheets view: Delete there must not delete. On the
      // board the active tool hears a key first, undo included, so a key the
      // maker gave a tool under way is never another command's (U.12).
      const claimed =
        !onSheets &&
        managerRef.current?.key({
          // The letter the keymap reads, so a tool claims the key the window would take.
          key: keyForTools(event),
          // What the press means to the board's tools, by the keymap (U.12).
          means: meaningsForTools(event, IS_MAC),
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
        }) === true;
      // A key the tool claimed is not also a shortcut: the window skips an
      // event whose default is prevented.
      if (claimed) {
        event.preventDefault();
        return;
      }

      if (command === 'undo' || command === 'redo') {
        event.preventDefault();
        if (command === 'redo') store.redo();
        else store.undo();
        return;
      }
      if (onSheets) return;

      // Enter on the board opens the selected outline's sizes (U.14) — on the
      // board only: a focused button, field or Parts row keeps its own Enter.
      const onBoard = event.target === document.body || event.target === canvasRef.current;
      if (
        onBoard &&
        keysOf('editSizes').some((binding) => matches(event, binding, IS_MAC)) &&
        chipsRef.current?.open() === true
      ) {
        event.preventDefault();
      }
    };

    // On the document, which a key bubbles through before the window: the tool
    // hears it before the app's shortcuts do, and a dialog that stops a key
    // still stops it before either.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [store, paint]);

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

  /** Where a guide dragged from a ruler lies: snapped like a tool's point, never to itself. */
  const rulerGuideAt = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, id: string): Vec2 => {
      const input = toInput(event);
      return managerRef.current?.snapGesture(input, [id]).at ?? input.at;
    },
    [toInput],
  );

  /** The sheet and piece under an event on the Sheets view. */
  const pickOnSheets = useCallback(
    (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): { sheet: CanvasStatus['sheet']; partId: string | null } => {
      const viewport = sheetsViewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const at = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);
      const plan = sheetPlanFor(store.getState().document.project);
      const hit = pieceAt(plan, layoutSheets(plan), at);
      return hit === null
        ? { sheet: null, partId: null }
        : { sheet: { number: hit.sheet + 1, count: plan.sheets.length }, partId: hit.partId };
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
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const thickness = DEFAULT_RULER_STYLE.thicknessPx;
      if (event.button === 0 && (x < DEFAULT_RULER_STYLE.leftThicknessPx || y < thickness)) {
        managerRef.current?.activate('select');
        onToolChange('select');
        const guide = { id: nextId(), angleRad: y < thickness ? 0 : Math.PI / 2 };
        rulerGuideRef.current = guide;
        store.begin({ action: 'add-guide' });
        store.preview(addGuide({ ...guide, origin: rulerGuideAt(event, guide.id) }));
        invalidate();
        return;
      }
      managerRef.current?.pointerDown(toInput(event));
    },
    [pickOnSheets, toInput, rulerGuideAt, onToolChange, nextId, store, invalidate],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const viewport = camera();
      const panning = panningRef.current;

      const rect = event.currentTarget.getBoundingClientRect();
      const raw = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);
      setPointerCss({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      const guide = rulerGuideRef.current;
      if (guide !== null) {
        if (!store.inTransaction) {
          rulerGuideRef.current = null;
          return;
        }
        store.preview(addGuide({ ...guide, origin: rulerGuideAt(event, guide.id) }));
        invalidate();
        return;
      }

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
        // The same sheet is the same state: a pointer move within it re-renders nothing.
        setSheetUnder((was) =>
          was?.number === under.sheet?.number && was?.count === under.sheet?.count
            ? was
            : under.sheet,
        );
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
    [camera, invalidate, pickOnSheets, rulerGuideAt, store, toInput],
  );

  /**
   * A right-click on the board (8.8): what a click would pick, with any tool,
   * since the panels already run these commands whatever tool is active.
   * Nothing on the sheets — no tool acts there — and nothing mid-drag, or with
   * Alt, which pans. On empty board there is no menu and the selection stays:
   * a right-click that missed an edge must not undo a multi-selection. A
   * locked piece is found, unlike by a click: this is where it is unlocked.
   */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (viewRef.current === 'sheets' || store.inTransaction || event.altKey) return;
      const viewport = viewportRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const at = viewport.fromCssPoint(event.clientX - rect.left, event.clientY - rect.top);
      const hit = hitTest(
        evaluate(store.getState().document.project),
        at,
        viewport.pickToleranceMm(),
        { locked: true },
      );
      if (hit === null) return;
      onContextMenuRef.current?.(
        { kind: 'feature', id: hit },
        { x: event.clientX, y: event.clientY },
      );
    },
    [store],
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
      const guide = rulerGuideRef.current;
      if (guide !== null) {
        rulerGuideRef.current = null;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (
          event.type === 'pointercancel' ||
          x < DEFAULT_RULER_STYLE.leftThicknessPx ||
          y < DEFAULT_RULER_STYLE.thicknessPx ||
          x > rect.width ||
          y > rect.height
        ) {
          store.rollback();
        } else {
          store.preview(addGuide({ ...guide, origin: rulerGuideAt(event, guide.id) }));
          store.commit();
          store.selectGuide(guide.id);
        }
        invalidate();
        return;
      }
      managerRef.current?.pointerUp(toInput(event));
    },
    [store, toInput, rulerGuideAt, invalidate],
  );

  // The board's name, for the one Tab stop it is (U.14).
  const boardName = view === 'sheets' ? t('view.sheetsBoard') : t('view.designBoard');

  return (
    <div className="canvas-host" ref={containerRef}>
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        data-view={view}
        // One Tab stop for the board (U.14): its keys are the tools', and
        // Enter there opens the selected outline's sizes.
        tabIndex={0}
        role="application"
        aria-label={boardName}
        style={{ cursor: view === 'sheets' ? 'default' : toolCursor }}
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
        onContextMenu={handleContextMenu}
      />
      {view === 'design' && (
        <ValueChips
          ref={chipsRef}
          store={store}
          drawing={drawing}
          drawn={drawn}
          invalidate={invalidate}
          toBoard={toBoard}
        />
      )}
      {view === 'design' && selectionBar !== null && (
        <SelectionBar
          ref={barRef}
          store={store}
          tools={selectionBar}
          nextId={nextId}
          invalidate={invalidate}
          toBoard={toBoard}
        />
      )}
      {children}
      {sheetsNotice && pointerCss !== null && (
        <div
          className="canvas-notice"
          data-testid="sheets-notice"
          role="status"
          style={{ left: pointerCss.x + 16, top: pointerCss.y + 20 }}
        >
          {t('sheets.placedForYou')}
        </div>
      )}
      {notice !== null && pointerCss !== null && (
        <CanvasNotice problem={notice} at={pointerCss} bounds={containerSize} />
      )}
    </div>
  );
}

/** Whether two drafts are the same shape: a frame that changed nothing sets nothing. */
function sameDraft(a: SizeDraft | null, b: SizeDraft | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    approxEq(a.origin.x, b.origin.x) &&
    approxEq(a.origin.y, b.origin.y) &&
    approxEq(a.width, b.width) &&
    approxEq(a.height, b.height) &&
    approxEq(a.corner, b.corner) &&
    a.refusals === b.refusals
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
  const { t } = useI18n();
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
      {describeProblem(problem, t)}
    </div>
  );
}

/** What the Sheets view last drew, so panning does not lay the sheets out again. */
interface SheetsCache {
  readonly plan: SheetPlan;
  /** The words the labels were made in: a new language makes new labels. */
  readonly i18n: I18n;
  readonly selected: string;
  readonly hovered: string | null;
  readonly layers: readonly SheetsLayer[];
}

function selectedKey(selected: ReadonlySet<string>): string {
  return [...selected].sort().join(' ');
}
