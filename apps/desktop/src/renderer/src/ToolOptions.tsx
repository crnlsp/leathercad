import { formatEditable } from '@leathercad/core';
import type { DrawMode, HardwareOptions } from '@leathercad/editor';

import { PUNCH_SIZES_MM } from './punches.js';

/**
 * One fixed result each (X4). *Outline* and *Stitch + allowance* each make a
 * new part and never read the selection; the rest join the selected one.
 *
 * *Stitch + allowance* dimensions the part from its **opening**: what is drawn
 * is the stitch line, and the cut edge is derived outward from it — the
 * direction a maker wants when the inside measurement is the one that matters
 * (§3.4).
 */
const DRAW_MODES: readonly { readonly id: DrawMode; readonly label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'stitch-allowance', label: 'Stitch + allowance' },
  { id: 'cut-out', label: 'Cut-out' },
  { id: 'stitch', label: 'Stitch' },
  { id: 'fold', label: 'Fold' },
  { id: 'marking', label: 'Marking' },
];

const HARDWARE_TYPES: readonly HardwareOptions['hardwareType'][] = [
  'rivet',
  'snap',
  'screw',
  'eyelet',
  'other',
];

/**
 * The options row above the canvas — **always present** (UI Foundations §7.1).
 *
 * It used to render only for a tool with options, so the canvas grew and
 * shrank by its height on every tool change and the drawing jumped ~8.7 mm
 * under the pointer. Reserving the row removes that at its source, and keeps
 * *Draw as* — the setting that carries the leather meaning — on screen instead
 * of appearing and vanishing with the tool. Hardware shows its own settings;
 * every other tool shows what the next drawing will be.
 *
 * "Draw as" lives here rather than in the rail because it is not a mode: it
 * does not change what a click *does*, it changes what the result is *called*.
 * A fold line can be drawn with any of the five draw tools, so a tool per
 * combination would be fifteen buttons for three ideas.
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
    return (
      <div className="tool-options" data-testid="tool-options">
        <span className="field-label">Draw as</span>
        {DRAW_MODES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={choice.id === drawAs ? 'chip active' : 'chip'}
            data-testid={`draw-as-${choice.id}`}
            aria-pressed={choice.id === drawAs}
            onClick={() => onDrawAs(choice.id)}
          >
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
