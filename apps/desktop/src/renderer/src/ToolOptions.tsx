import { formatEditable } from '@leathercad/core';
import type { DrawMode, EditPointsOptions, HardwareOptions } from '@leathercad/editor';
import { useId, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { DRAW_GROUPS } from './drawModes.js';
import { useI18n } from './i18n.js';
import { KeyCap, useKeyLabel } from './keyCaps.js';
import { NumberField } from './NumberField.js';

import { PUNCH_SIZES_MM } from './punches.js';
import { FeatureMark } from './icons/marks.js';
import type { Mark } from './icons/markFor.js';
import { ToolIcon } from './icons/ToolIcon.js';
import { DRAWING_TOOL_IDS, type ToolId } from './tools.js';
import { Tooltip } from './Tooltip.js';
import { fitWorkRow, type WorkRowFit } from './workRow.js';

/** The line each choice makes, as the board draws it (decisions §4.1). */
const MARK_OF: Readonly<Record<DrawMode, Mark>> = {
  outline: 'cut-edge',
  'cut-out': 'cut-out',
  stitch: 'stitch-line',
  'stitch-allowance': 'seam-allowance',
  fold: 'fold-valley',
  marking: 'marking',
};

const DRAW_MODES: readonly DrawMode[] = DRAW_GROUPS.flatMap((entry) => entry.modes);

const HARDWARE_TYPES: readonly HardwareOptions['hardwareType'][] = [
  'rivet',
  'snap',
  'screw',
  'eyelet',
  'other',
];

/**
 * The active tool's options, in the work bar (F.8) — **always present**, so
 * the bar keeps its height and the board never jumps when the tool changes
 * (UI Foundations §7.1).
 *
 * *Draw as* is offered only while a drawing tool is active: it does not change
 * what a click *does*, it changes what the drawn line is *called*, and for
 * Select, Rotate or Scale that is a setting with no effect. A fold line can be
 * drawn with any of the five drawing tools, so a tool per combination would be
 * fifteen buttons for three ideas. Its choices come in the workshop's groups,
 * Cut · Stitch · Mark (MS.5), as many of them as `fit` has room for (MS.7).
 * Hardware asks its own question here.
 */
export function ToolOptions({
  toolId,
  drawAs,
  onDrawAs,
  hardware,
  onHardware,
  points,
  onPoints,
  fit,
}: {
  toolId: string;
  drawAs: DrawMode;
  onDrawAs: (next: DrawMode) => void;
  hardware: HardwareOptions;
  onHardware: (next: HardwareOptions) => void;
  points: EditPointsOptions;
  onPoints: (next: EditPointsOptions) => void;
  /** What row 3 has room for (`useWorkRowFit`). */
  fit: WorkRowFit;
}) {
  const { t } = useI18n();
  const groupId = useId();
  // The radius R rounds a picked corner to (3.9d). Asked here rather than
  // after the key, so rounding stays one keystroke, like the punch size.
  if (toolId === 'points') {
    return (
      <div className="tool-options" data-testid="tool-options">
        <NumberField
          label={t('toolOptions.cornerRadius')}
          value={points.cornerRadiusMm}
          min={0.1}
          step={0.5}
          onCommit={(cornerRadiusMm) => onPoints({ ...points, cornerRadiusMm })}
        />
      </div>
    );
  }

  if (toolId !== 'hardware') {
    if (!DRAWING_TOOL_IDS.has(toolId)) {
      return <div className="tool-options" data-testid="tool-options" />;
    }
    /** A choice's face: the line it makes, in its colour and dash on the board, and its word. */
    const face = (mode: DrawMode) => (
      <>
        <span className="line-sample">
          <FeatureMark mark={MARK_OF[mode]} plane="ground" />
        </span>
        {t(`drawMode.${mode}`)}
      </>
    );
    return (
      <>
        <div className="tool-options drawing-options" data-testid="tool-options">
          {fit.choices === 'select' ? (
            <label className="draw-as-select">
              <span className="field-label">{t('toolOptions.drawAs')}</span>
              <select
                data-testid="draw-as-select"
                value={drawAs}
                onChange={(event) => {
                  const choice = DRAW_MODES.find((mode) => mode === event.target.value);
                  if (choice !== undefined) onDrawAs(choice);
                }}
              >
                {DRAW_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`drawMode.${mode}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <span className="draw-as-label">{t('toolOptions.drawAs')}</span>
              {DRAW_GROUPS.map(({ group, modes }) => (
                <div
                  key={group}
                  className="draw-group"
                  role="group"
                  aria-labelledby={`${groupId}-${group}`}
                >
                  {/* Given way, the name still names the group to a screen reader. */}
                  <span
                    className={
                      fit.groupNames ? 'draw-group-name' : 'draw-group-name visually-hidden'
                    }
                    id={`${groupId}-${group}`}
                  >
                    {t(`drawGroup.${group}`)}
                  </span>
                  <div className="draw-group-box">
                    {modes.map((mode) => (
                      <Tooltip key={mode} text={t(`drawModeTip.${mode}`)}>
                        <button
                          type="button"
                          className={mode === drawAs ? 'chip active' : 'chip'}
                          data-testid={`draw-as-${mode}`}
                          aria-pressed={mode === drawAs}
                          onClick={() => onDrawAs(mode)}
                        >
                          {face(mode)}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {/* The same choices with nothing given way, laid out and never seen nor
            reached, so each part's width is known before it is shown (MS.7). */}
        <div className="draw-as-measure" aria-hidden="true" inert>
          <div className="tool-options drawing-options draw-as-copy">
            <span className="draw-as-label">{t('toolOptions.drawAs')}</span>
            {DRAW_GROUPS.map(({ group, modes }) => (
              <div key={group} className="draw-group">
                <span className="draw-group-name">{t(`drawGroup.${group}`)}</span>
                <div className="draw-group-box">
                  {modes.map((mode) => (
                    <button key={mode} type="button" className="chip" tabIndex={-1}>
                      {face(mode)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="tool-options" data-testid="tool-options">
      <label className="field">
        <span className="field-label">{t('toolOptions.punch')}</span>
        <select
          data-testid="hardware-diameter"
          value={String(hardware.diameterMm)}
          onChange={(event) => onHardware({ ...hardware, diameterMm: Number(event.target.value) })}
        >
          {PUNCH_SIZES_MM.map((mm) => (
            <option key={mm} value={String(mm)}>
              {formatEditable(mm, 2)} mm
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{t('toolOptions.for')}</span>
        <select
          data-testid="hardware-type"
          value={hardware.hardwareType}
          onChange={(event) =>
            onHardware({
              ...hardware,
              hardwareType: event.target.value as HardwareOptions['hardwareType'],
            })
          }
        >
          {HARDWARE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`hardware.${type}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * The tool row's first cell (MS.5): as wide as the rail and above it, so the
 * rail rises into the row and the options that follow are plainly this tool's.
 * Its icon, name and key while the rail shows names; the icon alone while it is
 * narrow, the name kept for a screen reader.
 */
export function WorkHead({ toolId, names }: { toolId: ToolId; names: boolean }) {
  const { t } = useI18n();
  return (
    <div className="work-head" data-testid="work-head">
      <span className="tool-face">
        <ToolIcon toolId={toolId} size={names ? 16 : 20} />
        <span className={names ? undefined : 'visually-hidden'}>{t(`tools.${toolId}.name`)}</span>
      </span>
      {names && <KeyCap command={`tool.${toolId}`} />}
    </div>
  );
}

/** Everything shown: before the first measure, and while the row has room. */
const WHOLE_ROW: WorkRowFit = { allKeys: true, groupNames: true, choices: 'chips' };

/**
 * What row 3 keeps on a narrow window (MS.7): `fitWorkRow` over the widths of
 * the row's parts as drawn, and the room the row has.
 *
 * The parts are read where they are always laid out whole, whatever is shown:
 * the head cell; Draw as's copy (`.draw-as-copy`), from the edges of its parts,
 * so its margins and gaps are counted as drawn; and "? all keys"'s copy
 * (`.work-hints-copy`, `OptionHints`'). Measured before the first paint, and
 * again when the window, the head, a copy, the words or the keys change.
 * Widths are rounded out and the room down, so what is kept always fits.
 *
 * The row is given as a ref to set on it, not one to read: it is there only
 * while a project is open, so the measuring starts when it appears.
 *
 * @param drawing whether the row holds Draw as: a drawing tool, on Design
 * @returns what the row keeps, and the ref for the row
 */
export function useWorkRowFit(
  drawing: boolean,
): readonly [WorkRowFit, (row: HTMLElement | null) => void] {
  const { t } = useI18n();
  const label = useKeyLabel();
  const [fit, setFit] = useState<WorkRowFit>(WHOLE_ROW);
  const [row, setRow] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (row === null) return;
    const head = row.querySelector('.work-head');
    const copy = row.querySelector('.draw-as-copy');
    const keys = row.querySelector('.work-hints-copy');
    const measure = (): void => {
      const style = getComputedStyle(row);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const padding = Number.parseFloat(style.paddingRight) || 0;
      const width = (element: Element | null): number =>
        element === null ? 0 : element.getBoundingClientRect().width;
      let drawAs = 0;
      let groupNames = 0;
      let choices = 0;
      const groups = copy === null ? [] : [...copy.querySelectorAll('.draw-group')];
      if (copy !== null && groups[0] !== undefined) {
        const { left, width: whole } = copy.getBoundingClientRect();
        // The label, its margin and the gap after it: up to the first group.
        drawAs = groups[0].getBoundingClientRect().left - left;
        // Each name and the gap after it: up to its box.
        for (const group of groups) {
          const name = group.querySelector('.draw-group-name');
          const box = group.querySelector('.draw-group-box');
          if (name !== null && box !== null) {
            groupNames += box.getBoundingClientRect().left - name.getBoundingClientRect().left;
          }
        }
        choices = whole - drawAs - groupNames;
      }
      const next = fitWorkRow(
        {
          // The head, the gaps either side of the options, and the row's padding.
          head: Math.ceil(width(head) + 2 * gap + padding),
          drawAs: Math.ceil(drawAs),
          groupNames: Math.ceil(groupNames),
          choices: Math.ceil(choices),
          allKeys: Math.ceil(width(keys)),
        },
        Math.floor(row.clientWidth),
      );
      setFit((previous) =>
        previous.allKeys === next.allKeys &&
        previous.groupNames === next.groupNames &&
        previous.choices === next.choices
          ? previous
          : next,
      );
    };
    measure();
    // Applied in the frame the size changed in, before it is painted: the row
    // is never seen running past the window, and a test that waits a frame
    // after a resize reads the row fitted to it.
    const observer = new ResizeObserver(() => flushSync(measure));
    for (const element of [row, head, copy, keys]) if (element !== null) observer.observe(element);
    return () => observer.disconnect();
    // The copy is there only while Draw as is; the words and the keys' labels
    // are what the widths are made of.
  }, [row, drawing, t, label]);

  return [fit, setRow];
}
