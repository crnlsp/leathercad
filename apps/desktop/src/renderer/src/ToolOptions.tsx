import type { DrawAs, HardwareOptions } from '@leathercad/editor';

import { PUNCH_SIZES_MM } from './punches.js';

/** Which tools draw geometry whose kind the user chooses. */
const DRAW_TOOLS: ReadonlySet<string> = new Set(['rectangle', 'circle', 'arc', 'line', 'polyline']);

const DRAW_AS_CHOICES: readonly { readonly id: DrawAs; readonly label: string }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'fold', label: 'Fold' },
  { id: 'mark', label: 'Marking' },
];

const HARDWARE_TYPES: readonly HardwareOptions['hardwareType'][] = [
  'rivet',
  'snap',
  'screw',
  'eyelet',
  'other',
];

/**
 * Settings for the active tool, and nothing else.
 *
 * Renders nothing at all when the active tool has no options — an empty strip
 * above the canvas is the noise this layout exists to remove.
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
  drawAs: DrawAs;
  onDrawAs: (next: DrawAs) => void;
  hardware: HardwareOptions;
  onHardware: (next: HardwareOptions) => void;
}) {
  if (DRAW_TOOLS.has(toolId)) {
    return (
      <div className="tool-options" data-testid="tool-options">
        <span className="field-label">Draw as</span>
        {DRAW_AS_CHOICES.map((choice) => (
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

  if (toolId === 'hardware') {
    return (
      <div className="tool-options" data-testid="tool-options">
        <label className="field">
          <span className="field-label">Punch</span>
          <select
            data-testid="hardware-diameter"
            value={String(hardware.diameterMm)}
            onChange={(event) =>
              onHardware({ ...hardware, diameterMm: Number(event.target.value) })
            }
          >
            {PUNCH_SIZES_MM.map((mm) => (
              <option key={mm} value={String(mm)}>
                {mm} mm
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

  return null;
}
