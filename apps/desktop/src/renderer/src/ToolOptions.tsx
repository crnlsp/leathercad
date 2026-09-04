import type { JSX } from 'react';

/**
 * Settings for the active tool, and nothing else.
 *
 * Renders nothing at all when the active tool has no options — an empty strip
 * above the canvas is the noise this layout exists to remove. It is here
 * before it is needed because tool settings are arriving shortly (the
 * polyline's angle step, a corner radius for the rectangle tool, iron pitch
 * for stitching), and without a designated home they end up in the rail.
 */
export function ToolOptions({ toolId }: { toolId: string }) {
  const options = OPTIONS[toolId];
  if (options === undefined) return null;

  return (
    <div className="tool-options" data-testid="tool-options">
      {options}
    </div>
  );
}

/** Keyed by tool id. Empty until a tool has a setting worth showing. */
const OPTIONS: Record<string, JSX.Element | undefined> = {};
