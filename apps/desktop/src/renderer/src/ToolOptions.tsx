import { formatEditable } from '@leathercad/core';
import type { DrawMode, HardwareOptions } from '@leathercad/editor';

import { PUNCH_SIZES_MM } from './punches.js';
import { FeatureMark } from './icons/marks.js';
import type { Mark } from './icons/markFor.js';
import { DRAWING_TOOL_IDS } from './tools.js';

/**
 * One fixed result each (X4). *Outline* and *Stitch + allowance* each make a
 * new part and never read the selection; the rest join the selected one.
 *
 * *Stitch + allowance* dimensions the part from its **opening**: what is drawn
 * is the stitch line, and the cut edge is derived outward from it — the
 * direction a maker wants when the inside measurement is the one that matters
 * (§3.4).
 */
const DRAW_MODES: readonly {
  readonly id: DrawMode;
  readonly label: string;
  readonly mark: Mark;
}[] = [
  { id: 'outline', label: 'Outline', mark: 'cut-edge' },
  { id: 'stitch-allowance', label: 'Stitch + allowance', mark: 'seam-allowance' },
  { id: 'cut-out', label: 'Cut-out', mark: 'cut-out' },
  { id: 'stitch', label: 'Stitch', mark: 'stitch-line' },
  { id: 'fold', label: 'Fold', mark: 'fold-valley' },
  { id: 'marking', label: 'Marking', mark: 'marking' },
];

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
 * fifteen buttons for three ideas. Hardware asks its own question here. Every
 * other tool leaves the space to its one line of guidance, which follows.
 */
export function ToolOptions({
  toolId,
  drawAs,
  onDrawAs,
  hardware,
  onHardware,
}: {
  toolId: string;
  drawAs: DrawMode;
  onDrawAs: (next: DrawMode) => void;
  hardware: HardwareOptions;
  onHardware: (next: HardwareOptions) => void;
}) {
  if (toolId !== 'hardware') {
    if (!DRAWING_TOOL_IDS.has(toolId)) {
      return <div className="tool-options" data-testid="tool-options" />;
    }
    return (
      <div className="tool-options" data-testid="tool-options">
        <span className="draw-as-label">Draw as</span>
        {DRAW_MODES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={choice.id === drawAs ? 'chip active' : 'chip'}
            data-testid={`draw-as-${choice.id}`}
            aria-pressed={choice.id === drawAs}
            onClick={() => onDrawAs(choice.id)}
          >
            {/* Each chip shows the line it makes (decisions §4.1). */}
            <FeatureMark mark={choice.mark} />
            {choice.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="tool-options" data-testid="tool-options">
      <label className="field">
        <span className="field-label">Punch</span>
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
        <span className="field-label">For</span>
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
              {type[0]!.toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
