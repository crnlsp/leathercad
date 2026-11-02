import { drawnBounds, type DocumentStore } from '@leathercad/document';
import { MIN_HOLES_IN_A_SET, diagnose, evaluate } from '@leathercad/domain';
import { placeSelectionBar, type CssBox, type ViewportView } from '@leathercad/render';
import {
  Fragment,
  memo,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { FeatureMark } from './icons/marks.js';
import type { MakerTools } from './irons.js';
import { nextSteps, runStep, stepRefusal, stitchChain, type StepId } from './nextSteps.js';
import { describeProblem } from './problemText.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import { resolvedFor } from './sheets.js';
import {
  describeSpacing,
  describeSpacingShort,
  formatRuns,
  formatSpacing,
  spacingAgainstPitch,
  spacingGlyph,
} from './spacing.js';

/** What the canvas asks of the bar, once a frame. */
export interface SelectionBarHandle {
  /**
   * Puts the bar where `placeSelectionBar` says for this camera, clear of the
   * chips (`taken`), or hides it: `hidden` while a drag or a shape is under way.
   */
  place(
    view: ViewportView,
    room: { area?: CssBox; obstacles: readonly CssBox[] },
    taken: readonly CssBox[],
    hidden: boolean,
  ): void;
  /** F6: into the bar from wherever focus is, or out of it to the board. False with no bar in view. */
  toggleFocus(): boolean;
}

const STEP_WORDS = {
  stitchLine: 'selectionBar.step.stitchLine',
  holes: 'selectionBar.step.holes',
  allowance: 'selectionBar.step.allowance',
} as const;

/** `text` with the first `value` in it bold: a number read at a glance, in any word order. */
function emphasise(text: string, value: string): ReactNode {
  const at = text.indexOf(value);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <b>{value}</b>
      {text.slice(at + value.length)}
    </>
  );
}

/**
 * The selection bar (R-14, U.17): under the selected piece, how its stitching
 * came out — holes, spacing against the pitch, runs, how many to cut, the
 * numbers and words Properties shows — and *Next: Stitch line › Stitch holes ›
 * Seam allowance*, the first not yet made a button that makes it with My
 * tools' values, one undo step. Hole matching and thread length will be a
 * third line; nothing holds their place.
 *
 * Where it sits is the canvas's to say, once a frame, through `place`, as
 * the value chips' is. Never printed: it is not on the board at all.
 */
export const SelectionBar = memo(function SelectionBar({
  store,
  tools,
  nextId,
  invalidate,
  toBoard,
  ref,
}: {
  store: DocumentStore;
  tools: MakerTools;
  nextId: () => string;
  /** Asks the canvas for a frame, which places the bar again. */
  invalidate: () => void;
  /** Gives the keys back to the board. */
  toBoard: () => void;
  ref?: React.Ref<SelectionBarHandle>;
}) {
  const { t, locale } = useI18n();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const project = useSyncExternalStore(subscribe, () => store.getState().document.project);
  const selection = useSyncExternalStore(subscribe, () => store.getState().selection);
  const chain = useMemo(() => stitchChain(project, selection), [project, selection]);
  const barRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();

  // New words, a new size: place it again.
  useLayoutEffect(() => {
    invalidate();
  }, [chain, t, invalidate]);

  /** Focus to the step's button, or to the bar itself when every step is done. */
  const focusInside = useCallback((): void => {
    const bar = barRef.current;
    if (bar === null) return;
    const button = bar.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (button ?? bar).focus({ preventScroll: true });
  }, []);

  useImperativeHandle(
    ref,
    (): SelectionBarHandle => ({
      place(view, { area, obstacles }, taken, hidden) {
        const bar = barRef.current;
        if (bar === null) return;
        const { document, selection: now } = store.getState();
        const current = stitchChain(document.project, now);
        const bounds =
          current === null || hidden
            ? null
            : drawnBounds(
                evaluate(document.project),
                new Set(current.part.features.map((feature) => feature.id)),
              );
        const placed =
          bounds === null
            ? null
            : placeSelectionBar(view, {
                boundsMm: bounds,
                size: { width: bar.offsetWidth, height: bar.offsetHeight },
                taken,
                ...(area === undefined ? {} : { area }),
                obstacles,
              });
        if (placed === null) {
          // Hidden is not focusable: focus inside goes back to the board.
          if (bar.contains(window.document.activeElement)) toBoard();
          bar.style.visibility = 'hidden';
          return;
        }
        bar.style.transform = `translate(${String(placed.at.x)}px, ${String(placed.at.y)}px)`;
        bar.style.visibility = 'visible';
        bar.dataset['side'] = placed.side;
      },
      toggleFocus() {
        const bar = barRef.current;
        if (bar === null || bar.style.visibility !== 'visible') return false;
        if (bar.contains(window.document.activeElement)) toBoard();
        else focusInside();
        return true;
      },
    }),
    [store, toBoard, focusInside],
  );

  if (chain === null) return null;

  const resolved = resolvedFor(project)
    .parts.flatMap((part) => part.features)
    .find((entry) => entry.feature.id === chain.holes?.id);
  const holes = resolved?.ok === true ? resolved.holes : undefined;
  const op =
    chain.holes?.source.kind === 'derived' && chain.holes.source.op.type === 'stitch-holes'
      ? chain.holes.source.op
      : undefined;
  const reported = diagnose(project).find(
    (d) => d.featureId === chain.holes?.id && d.problem.code === 'HOLE_SPACING_DEVIATION',
  )?.severity;
  const number = new Intl.NumberFormat(locale);

  const steps = nextSteps(project, chain);
  // The first step not done: a button when it is still to make; when it
  // failed or is hidden, said instead, and nothing after it is offered — holes
  // on a stitch line that failed would fail too.
  const next = steps.find((step) => step.status !== 'done');
  const first = next?.status === 'todo' ? next.id : undefined;
  const refusal = first === undefined ? null : stepRefusal(project, chain, first);
  const note =
    next?.status === 'failed'
      ? describeProblem(next.problem, t)
      : next?.status === 'hidden'
        ? t('selectionBar.holesHidden')
        : refusal === null
          ? null
          : describeProblem(refusal, t);
  const make = (step: StepId): void => {
    runStep(store, nextId, chain, step, tools);
    // The keys stay in the bar, on the next step: F6, Enter, Enter makes two.
    requestAnimationFrame(focusInside);
  };

  const facts: ReactNode[] = [];
  const counted = steps.find((step) => step.id === 'holes')?.status === 'done';
  if (chain.stitch === null) facts.push(t('selectionBar.noStitching'));
  else if (chain.holes === null) facts.push(t('selectionBar.noHoles'));
  else if (counted && holes !== undefined && op !== undefined) {
    facts.push(
      <span key="holes" className="selection-bar-holes">
        <FeatureMark mark="stitch-holes" size={14} />
        {emphasise(t('selectionBar.holes', { count: holes.count }), number.format(holes.count))}
      </span>,
    );
    if (holes.count >= MIN_HOLES_IN_A_SET) {
      const check = spacingAgainstPitch(holes.achievedPitchMm, op.pitchMm);
      const glyph = spacingGlyph(check, reported);
      const spacing = formatSpacing(holes.achievedPitchMm);
      facts.push(
        <span key="spacing" data-testid="selection-bar-spacing" data-glyph={glyph}>
          {emphasise(
            t('selectionBar.spacing', { spacing, pitch: formatSpacing(op.pitchMm) }),
            spacing,
          )}{' '}
          <span className="selection-bar-glyph">
            {glyph === 'check' ? (
              <>
                <Icon of="check" size={14} />
                <span className="visually-hidden">{describeSpacing(check, t)}</span>
              </>
            ) : glyph === 'stretched' ? (
              <Icon of="stretched" size={14} />
            ) : glyph === 'squeezed' ? (
              <Icon of="squeezed" size={14} />
            ) : (
              <SeverityGlyph severity={glyph} />
            )}
          </span>
          {check.kind !== 'matches' && <> {describeSpacingShort(check, t)}</>}
        </span>,
      );
    }
    if (holes.runs.length > 1) {
      const runs = formatRuns(holes.runs);
      facts.push(
        <span key="runs" data-testid="selection-bar-runs">
          {emphasise(t('selectionBar.runs', { runs }), runs)}
        </span>,
      );
    }
  }
  // How many to cut, whatever the stitching (R-14's line 1).
  facts.push(
    <span key="cut" data-testid="selection-bar-cut">
      {emphasise(
        t('selectionBar.cut', { quantity: chain.part.quantity }),
        `×${number.format(chain.part.quantity)}`,
      )}
    </span>,
  );

  return (
    <div
      ref={barRef}
      className="selection-bar"
      role="group"
      tabIndex={-1}
      aria-label={t('selectionBar.title', { piece: chain.part.name })}
      data-testid="selection-bar"
      onKeyDown={(event) => {
        // Esc gives the keys back to the board, as it does from a chip.
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          toBoard();
        }
      }}
    >
      <p className="selection-bar-line" data-testid="selection-bar-summary">
        {facts.map((fact, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <span className="selection-bar-dot" aria-hidden="true">
                ·
              </span>
            )}
            {fact}
          </Fragment>
        ))}
      </p>
      <p className="selection-bar-line" data-testid="selection-bar-steps">
        <span className="selection-bar-next">{t('selectionBar.next')}</span>
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && (
              <span className="selection-bar-chevron" aria-hidden="true">
                ›
              </span>
            )}
            {step.status === 'done' ? (
              <span
                className="selection-bar-step"
                data-step={step.id}
                data-status={step.status}
                data-done=""
              >
                <Icon of="check" size={14} />
                <span className="visually-hidden">{t('selectionBar.done')}</span>
                {t(STEP_WORDS[step.id])}
              </span>
            ) : step.id === first ? (
              <button
                type="button"
                className="selection-bar-button"
                data-step={step.id}
                data-testid="selection-bar-step"
                disabled={refusal !== null}
                aria-describedby={refusal === null ? undefined : reasonId}
                onClick={() => make(step.id)}
              >
                <Icon of="plus" size={14} />
                {t(STEP_WORDS[step.id])}
              </button>
            ) : (
              <span className="selection-bar-step" data-step={step.id} data-status={step.status}>
                {t(STEP_WORDS[step.id])}
              </span>
            )}
          </Fragment>
        ))}
      </p>
      {note !== null && (
        <p id={reasonId} className="selection-bar-reason" data-testid="selection-bar-reason">
          {/* A step that failed is an error in Problems: its glyph as well as its words. */}
          {next?.status === 'failed' && <SeverityGlyph severity="error" />} {note}
        </p>
      )}
    </div>
  );
});
