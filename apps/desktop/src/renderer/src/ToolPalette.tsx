import { TOOL_GROUPS } from './tools.js';
import { Tooltip } from './Tooltip.js';

/**
 * The mode palette.
 *
 * Modes only. Everything here changes what a click does and stays active until
 * another is chosen; nothing here fires and finishes. See
 * docs/superpowers/specs/2026-09-04-tool-palette-design.md.
 */
export function ToolPalette({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="rail" data-testid="tool-rail" aria-label="Tools">
      {TOOL_GROUPS.filter((group) => group.tools.length > 0).map((group, index) => (
        <div className="rail-group" key={group.label ?? `lead-${index}`}>
          {group.label !== null && <h2 className="rail-heading">{group.label}</h2>}
          {group.tools.map((tool) => (
            <Tooltip key={tool.id} text={tool.howTo}>
              <button
                type="button"
                className={tool.id === activeId ? 'tool active' : 'tool'}
                data-testid={`tool-${tool.id}`}
                onClick={() => onSelect(tool.id)}
              >
                {tool.label}
                <kbd>{tool.key}</kbd>
              </button>
            </Tooltip>
          ))}
        </div>
      ))}
    </nav>
  );
}
