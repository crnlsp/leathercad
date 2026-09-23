import { TOOL_GROUPS } from './tools.js';
import { Tooltip } from './Tooltip.js';

/**
 * The mode palette — a column of its own.
 *
 * Modes only. Everything here changes what a click does and stays active until
 * another is chosen; nothing here fires and finishes. See
 * docs/superpowers/specs/2026-09-04-tool-palette-design.md.
 *
 * It used to sit above the parts tree and compete with it for height, which is
 * how the tree could shrink to nothing (audit §3.3). In its own column it never
 * scrolls and never competes (UI Foundations §7.1). **Expanded**, 152 px: label
 * and shortcut. **Collapsed**, 52 px: the shortcut alone as the face, with the
 * name and the guidance in the tooltip — until F.6 gives each tool an icon.
 */
export function ToolPalette({
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <nav
      className={collapsed ? 'rail collapsed' : 'rail'}
      data-testid="tool-rail"
      aria-label="Tools"
    >
      {TOOL_GROUPS.filter((group) => group.tools.length > 0).map((group, index) => (
        <div className="rail-group" key={group.label ?? `lead-${index}`}>
          {group.label !== null &&
            (collapsed ? (
              <hr className="rail-rule" aria-label={group.label} />
            ) : (
              <h2 className="rail-heading">{group.label}</h2>
            ))}
          {group.tools.map((tool) => (
            <Tooltip
              key={tool.id}
              text={collapsed ? `${tool.label} (${tool.key}) — ${tool.howTo}` : tool.howTo}
            >
              <button
                type="button"
                className={tool.id === activeId ? 'tool active' : 'tool'}
                data-testid={`tool-${tool.id}`}
                aria-label={collapsed ? tool.label : undefined}
                onClick={() => onSelect(tool.id)}
              >
                {!collapsed && tool.label}
                <kbd>{tool.key}</kbd>
              </button>
            </Tooltip>
          ))}
        </div>
      ))}

      <Tooltip text={collapsed ? 'Show tool names' : 'Hide tool names'}>
        <button
          type="button"
          className="tool rail-toggle"
          data-testid="rail-toggle"
          aria-pressed={!collapsed}
          aria-label={collapsed ? 'Show tool names' : 'Hide tool names'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </Tooltip>
    </nav>
  );
}
