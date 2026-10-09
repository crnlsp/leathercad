import { useI18n } from './i18n.js';
import { KeyCap, useKeysInSentences } from './keyCaps.js';
import { TOOL_GROUPS } from './tools.js';
import { Tooltip } from './Tooltip.js';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Icon } from './icons/Icon.js';
import { ToolIcon } from './icons/ToolIcon.js';

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
  const { t } = useI18n();
  const keys = useKeysInSentences();
  const toggle = collapsed ? t('tools.showNames') : t('tools.hideNames');
  return (
    <nav
      className={collapsed ? 'rail collapsed' : 'rail'}
      data-testid="tool-rail"
      aria-label={t('tools.label')}
    >
      {TOOL_GROUPS.filter((group) => group.tools.length > 0).map((group) => (
        <div className="rail-group" key={group.id ?? 'lead'}>
          {group.id !== null &&
            (collapsed ? (
              <hr className="rail-rule" aria-label={t(`tools.group.${group.id}`)} />
            ) : (
              <h2 className="rail-heading">{t(`tools.group.${group.id}`)}</h2>
            ))}
          {group.tools.map((tool) => {
            const name = t(`tools.${tool.id}.name`);
            const howTo = t(`tools.${tool.id}.howTo`, keys);
            return (
              <Tooltip
                key={tool.id}
                text={collapsed ? t('tools.collapsedTooltip', { name, howTo }) : howTo}
                keys={`tool.${tool.id}`}
              >
                <button
                  type="button"
                  className={tool.id === activeId ? 'tool active' : 'tool'}
                  data-testid={`tool-${tool.id}`}
                  aria-label={collapsed ? name : undefined}
                  onClick={() => onSelect(tool.id)}
                >
                  {/* Icon and label and shortcut expanded; the icon with the
                      shortcut as a corner badge collapsed (decisions §4.3). */}
                  <span className="tool-face">
                    <ToolIcon toolId={tool.id} size={collapsed ? 20 : 16} />
                    {!collapsed && name}
                  </span>
                  <KeyCap command={`tool.${tool.id}`} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}

      <Tooltip text={toggle}>
        <button
          type="button"
          className="tool rail-toggle"
          data-testid="rail-toggle"
          aria-pressed={!collapsed}
          aria-label={toggle}
          onClick={onToggleCollapsed}
        >
          <Icon of={collapsed ? ChevronsRight : ChevronsLeft} />
        </button>
      </Tooltip>
    </nav>
  );
}
