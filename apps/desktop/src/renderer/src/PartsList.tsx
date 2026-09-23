import {
  isPartVisible,
  setFeatureLocked,
  setFeatureVisible,
  setPartVisible,
  type DocumentStore,
} from '@leathercad/document';
import {
  featureTree,
  roleOf,
  type Badges,
  type Feature,
  type FeatureNode,
  type Part,
  type Project,
} from '@leathercad/domain';

import { useEffect, useRef, useState } from 'react';

import { CountBadge } from './CountBadge.js';
import { Tooltip } from './Tooltip.js';

/**
 * Every part in the project, and what each one is made of.
 *
 * Two jobs the canvas cannot do. It shows the **dependency tree** — *Outline ▸
 * Stitch line ▸ Holes* — which is where the reference graph becomes visible,
 * and it is the only way to reach a feature you cannot click: hidden behind
 * another part, off screen, or **locked**, which takes it out of hit-testing
 * entirely. That last one is why the lock and this panel are one slice: without
 * it, locking an outline would put it permanently out of reach.
 */
export function PartsList({
  store,
  project,
  selected,
  selectedParts,
  badges,
  onRemovePart,
  onDuplicatePart,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
  selectedParts: ReadonlySet<string>;
  /**
   * Problem counts, rolled up from the one diagnostic list. Passed in rather
   * than computed here so the panel and this tree cannot disagree (X7).
   */
  badges: Badges;
  /** Removes a part, asking first if anything outside it depends on it. */
  onRemovePart: (partId: string) => void;
  /** Copies a part, re-pointing the derivations inside it. */
  onDuplicatePart: (partId: string) => void;
}) {
  if (project.parts.length === 0) {
    return (
      <aside className="panel parts" data-testid="parts-list" aria-label="Parts">
        <h2>Parts</h2>
        <p className="panel-empty">
          No parts yet. Press R, then drag or click two corners to draw one.
        </p>
      </aside>
    );
  }

  return (
    <aside className="panel parts" data-testid="parts-list" aria-label="Parts">
      <h2>Parts</h2>
      {project.parts.map((part) => (
        <PartSection
          key={part.id}
          store={store}
          part={part}
          selected={selected}
          isSelected={selectedParts.has(part.id)}
          badges={badges}
          onRemovePart={onRemovePart}
          onDuplicatePart={onDuplicatePart}
        />
      ))}
    </aside>
  );
}

function PartSection({
  store,
  part,
  selected,
  isSelected,
  badges,
  onRemovePart,
  onDuplicatePart,
}: {
  store: DocumentStore;
  part: Part;
  selected: ReadonlySet<string>;
  isSelected: boolean;
  badges: Badges;
  onRemovePart: (partId: string) => void;
  onDuplicatePart: (partId: string) => void;
}) {
  const visible = isPartVisible(part);

  return (
    <section className={isSelected ? 'panel-section part selected' : 'panel-section part'}>
      <div className="part-heading">
        <button
          type="button"
          className="part-name"
          data-testid={`part-heading-${part.id}`}
          aria-pressed={isSelected}
          // Selecting the part is what makes it the target for the next
          // cut-out or fold line, without having to pick something inside it
          // first (§3.1).
          onClick={() => store.selectParts([part.id])}
        >
          {part.name}
          {part.quantity > 1 && <span className="badge">×{part.quantity}</span>}
          {/*
            Counting everything inside the part, its features included: a
            collapsed or scrolled-past part must not be able to hide trouble.
          */}
          <CountBadge badge={badges.parts.get(part.id) ?? null} />
        </button>
        <IconToggle
          testId={`part-visible-${part.id}`}
          on={visible}
          onLabel="Hide part"
          offLabel="Show part"
          glyph={visible ? '👁' : '🚫'}
          onToggle={() => store.dispatch(setPartVisible(part.id, !visible))}
        />
        <PartMenu part={part} onDuplicatePart={onDuplicatePart} onRemovePart={onRemovePart} />
      </div>

      {part.features.length === 0 ? (
        // A part is removed only on purpose (ADR 0009), so an emptied one
        // stays — named, and with the way to remove it right here.
        <div className="empty-part">
          <span className="panel-empty">Empty</span>
          <button
            type="button"
            className="tool"
            data-testid="remove-empty-part"
            onClick={() => onRemovePart(part.id)}
          >
            Remove
          </button>
        </div>
      ) : (
        featureTree(part).map((node) => (
          <FeatureRow
            key={node.feature.id}
            store={store}
            node={node}
            selected={selected}
            badges={badges}
            depth={0}
          />
        ))
      )}
    </section>
  );
}

/**
 * A part's own actions, behind one small button on its heading row.
 *
 * *Duplicate* and *Delete* used to take a full row under every part, which is
 * how six features filled the panel. In an overflow they cost nothing until
 * asked for (UI Foundations §7.1), and closing on Escape or a click elsewhere
 * keeps the menu from outliving the thought that opened it.
 */
function PartMenu({
  part,
  onDuplicatePart,
  onRemovePart,
}: {
  part: Part;
  onDuplicatePart: (partId: string) => void;
  onRemovePart: (partId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // A menu takes focus when it opens, and gives it back when Escape closes it
  // — heard wherever focus is, since a click does not always leave it here.
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="part-menu-anchor" ref={root}>
      <Tooltip text={open ? null : `Actions for ${part.name}`}>
        <button
          ref={trigger}
          type="button"
          className="icon-toggle"
          data-testid={`part-menu-${part.id}`}
          aria-label={`Actions for ${part.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          ⋯
        </button>
      </Tooltip>
      {open && (
        <div className="part-menu" role="menu" aria-label={`Actions for ${part.name}`}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            data-testid={`duplicate-part-${part.id}`}
            onClick={choose(() => onDuplicatePart(part.id))}
          >
            Duplicate
            <span className="menu-note">A copy beside this one, with its own stitching</span>
          </button>
          {part.features.length > 0 && (
            <button
              type="button"
              role="menuitem"
              className="menu-item danger"
              data-testid={`delete-part-${part.id}`}
              onClick={choose(() => onRemovePart(part.id))}
            >
              Delete part
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One feature, and whatever follows it.
 *
 * Indented by depth rather than nested in lists: the rows stay one flat column
 * of the same height, which is what makes a part with thirty features
 * scannable.
 */
function FeatureRow({
  store,
  node,
  selected,
  badges,
  depth,
}: {
  store: DocumentStore;
  node: FeatureNode;
  selected: ReadonlySet<string>;
  badges: Badges;
  depth: number;
}) {
  const { feature } = node;

  return (
    <>
      <div className="feature-row" style={{ paddingLeft: `${String(depth * 12)}px` }}>
        <button
          type="button"
          className={selected.has(feature.id) ? 'row selected' : 'row'}
          data-testid={`feature-row-${feature.id}`}
          // A locked feature is still selectable here, deliberately: it is out
          // of hit-testing on the canvas, so this is the only way to reach it
          // and unlock it.
          onClick={() => store.select([feature.id])}
        >
          <span className={`swatch role-${roleOf(feature)}`} />
          <span className="feature-name">{feature.name}</span>
          {isMirroredFeature(feature) && (
            // A counterpart already nests under its original here, but the
            // nesting alone reads the same as a stitch line's. This says which
            // relationship it is, in the width of one glyph.
            <Tooltip text="Mirrors the feature it nests under">
              <span className="row-mark" data-testid={`mirrored-mark-${feature.id}`}>
                ⇄
              </span>
            </Tooltip>
          )}
          {/* Only what names this feature: a part's own problems count on the
              part's row, not on every feature in it. */}
          <CountBadge badge={badges.features.get(feature.id) ?? null} />
        </button>
        <IconToggle
          testId={`feature-locked-${feature.id}`}
          on={feature.locked}
          onLabel="Unlock"
          offLabel="Lock"
          glyph={feature.locked ? '🔒' : '🔓'}
          onToggle={() => store.dispatch(setFeatureLocked(feature.id, !feature.locked))}
        />
        <IconToggle
          testId={`feature-visible-${feature.id}`}
          on={feature.visible}
          onLabel="Hide"
          offLabel="Show"
          glyph={feature.visible ? '👁' : '🚫'}
          onToggle={() => store.dispatch(setFeatureVisible(feature.id, !feature.visible))}
        />
      </div>
      {node.children.map((child) => (
        <FeatureRow
          key={child.feature.id}
          store={store}
          node={child}
          selected={selected}
          badges={badges}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

/** Whether this feature is a mirrored counterpart of another. */
function isMirroredFeature(feature: Feature): boolean {
  return (
    feature.kind !== 'text-label' &&
    feature.source.kind === 'derived' &&
    feature.source.op.type === 'mirror'
  );
}

/** A small on/off control that says what pressing it would do. */
function IconToggle({
  testId,
  on,
  onLabel,
  offLabel,
  glyph,
  onToggle,
}: {
  testId: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  glyph: string;
  onToggle: () => void;
}) {
  const label = on ? onLabel : offLabel;

  return (
    <Tooltip text={label}>
      <button
        type="button"
        className={on ? 'icon-toggle' : 'icon-toggle off'}
        data-testid={testId}
        aria-pressed={on}
        aria-label={label}
        onClick={onToggle}
      >
        {glyph}
      </button>
    </Tooltip>
  );
}
