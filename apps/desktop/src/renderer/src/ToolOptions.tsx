import { formatEditable } from '@leathercad/core';
import type { DrawMode, EditPointsOptions, HardwareOptions } from '@leathercad/editor';
import { useId } from 'react';

import { DRAW_GROUPS } from './drawModes.js';
import { useI18n } from './i18n.js';
import { KeyCap } from './keyCaps.js';
import { NumberField } from './NumberField.js';

import { PUNCH_SIZES_MM } from './punches.js';
import { FeatureMark } from './icons/marks.js';
import type { Mark } from './icons/markFor.js';
import { ToolIcon } from './icons/ToolIcon.js';
import { DRAWING_TOOL_IDS, type ToolId } from './tools.js';
import { Tooltip } from './Tooltip.js';

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
 * Cut · Stitch · Mark (MS.5). Hardware asks its own question here.
 */
export function ToolOptions({
  toolId,
  drawAs,
  onDrawAs,
  hardware,
  onHardware,
  points,
  onPoints,
}: {
  toolId: string;
  drawAs: DrawMode;
  onDrawAs: (next: DrawMode) => void;
  hardware: HardwareOptions;
  onHardware: (next: HardwareOptions) => void;
  points: EditPointsOptions;
  onPoints: (next: EditPointsOptions) => void;
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
    return (
      <div className="tool-options drawing-options" data-testid="tool-options">
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
        <span className="draw-as-label">{t('toolOptions.drawAs')}</span>
        {DRAW_GROUPS.map(({ group, modes }) => (
          <div
            key={group}
            className="draw-group"
            role="group"
            aria-labelledby={`${groupId}-${group}`}
          >
            <span className="draw-group-name" id={`${groupId}-${group}`}>
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
                    {/* The line it makes, in its colour and dash on the board. */}
                    <span className="line-sample">
                      <FeatureMark mark={MARK_OF[mode]} plane="ground" />
                    </span>
                    {t(`drawMode.${mode}`)}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </div>
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
