import {
  isPartVisible,
  renameFeature,
  setFeatureLocked,
  setFeatureVisible,
  setPartName,
  setPartVisible,
  type DocumentStore,
} from '@leathercad/document';
import type { Badge, Badges, Feature, Part, PartId, Project } from '@leathercad/domain';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import type { PartPrintStatus } from '@leathercad/export';

import { intoMenu } from './fieldMenu.js';
import type { RightClicked } from './contextMenu.js';
import { CountBadge } from './CountBadge.js';
import { useI18n } from './i18n.js';
import { IS_MAC, useKeysInSentences } from './keyCaps.js';
import { keysOf, matches, type CommandId } from './keymap.js';
import { MIRROR_ICON } from './icons/arrange.js';
import { Icon } from './icons/Icon.js';
import { FeatureMark, MarkOf } from './icons/marks.js';
import { MenuButton } from './Menu.js';
import { PieceThumbnail, pieceName, pressOf } from './PanelFold.js';
import {
  featureKey,
  partKey,
  revealed,
  rowName,
  treeMove,
  treeRows,
  type TreeRow,
} from './partsTree.js';
import { resolvedFor } from './sheets.js';
import { describePrintStatus } from './sheetWords.js';
import { isTyping } from './shortcuts.js';
import { Tooltip } from './Tooltip.js';

/**
 * Every piece in the project, and what each one is made of (R-07, U.8).
 *
 * Two jobs the canvas cannot do. It shows the **dependency tree** — *Outline ›
 * Stitch line › Stitch holes* — which is where the reference graph becomes
 * visible, and it is the only way to reach a feature you cannot click: hidden
 * behind another part, off screen, or **locked**, which takes it out of
 * hit-testing entirely (F.2).
 *
 * A WAI-ARIA tree: one Tab stop, the row last focused (roving `tabindex`); the
 * arrows move and fold, Space hides and shows, F2 renames — heard only here,
 * so they never reach the window, and the window's keys (Delete, Ctrl+Z, a
 * tool's letter) pass through a focused row as they did. Pieces fold, open
 * until the maker closes one; a selection made on the board opens its piece
 * and scrolls its row into view, leaving focus where it was.
 */
export function PartsList({
  store,
  project,
  selected,
  selectedParts,
  badges,
  printStatus,
  onRemovePart,
  onDuplicatePart,
  onContextMenu,
  onOpenSample,
  toggle,
}: {
  store: DocumentStore;
  project: Project;
  /**
   * Which parts do not print, from the sheet plan the PDF writes (7.4b). Where
   * each one does is the Sheets view's own panel (U.9). Passed in so this tree,
   * the sheet count and that panel read one answer.
   */
  printStatus: ReadonlyMap<string, PartPrintStatus>;
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
  /** A right-click on a row (8.8): the same menu as on the board. */
  onContextMenu: OpenMenu;
  /** Opens the worked sample (8.3): a finished pattern to take apart. */
  onOpenSample: () => void;
  /** Its fold (U.5), at the header's end. */
  toggle?: ReactNode;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const keys = useKeysInSentences();
  const tree = useRef<HTMLDivElement>(null);
  // The pieces the maker closed: the view's, never the document's.
  const [closed, setClosed] = useState<ReadonlySet<PartId>>(() => new Set());
  // The row Tab comes back to.
  const [active, setActive] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  // A new selection opens its piece and becomes the row Tab reaches, set
  // while rendering — React's pattern for state that follows a prop.
  const selection = [...selected, ...[...selectedParts].map(partKey)].join(' ');
  const [shown, setShown] = useState(selection);
  if (shown !== selection) {
    setShown(selection);
    const next = revealed(project.parts, closed, selected);
    if (next !== closed) setClosed(next);
    const first = firstSelected(project.parts, selected, selectedParts);
    if (first !== null) setActive(first);
  }
  // …and its row scrolls into view, once it is drawn. Focus stays put.
  useEffect(() => {
    tree.current
      ?.querySelector('[role="treeitem"][aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selection]);

  const rows = treeRows(project.parts, closed);
  // A rename lasts as long as its row: one that goes — undone away from the
  // macOS menu while the field has focus, deleted, folded out of sight — ends
  // with it, keeping nothing half-typed, so the field never comes back with
  // the row uninvited.
  if (renaming !== null && !rows.some((row) => row.key === renaming)) setRenaming(null);

  if (project.parts.length === 0) {
    // The link sits where the language puts it in the sentence.
    const [before, after] = t('parts.sample').split('{{link}}');
    return (
      <aside
        className="panel parts"
        tabIndex={-1}
        data-testid="parts-list"
        aria-label={t('parts.title')}
      >
        <PartsTitle toggle={toggle} count={null} />
        <p className="panel-empty">{t('parts.empty', keys)}</p>
        <p className="panel-empty">
          {before}
          <button
            type="button"
            className="link-button"
            data-testid="open-sample"
            onClick={onOpenSample}
          >
            {t('parts.sampleLink')}
          </button>
          {after}
        </p>
      </aside>
    );
  }

  // The row Tab reaches: the last one focused or selected, its piece while
  // the piece is closed, or the first.
  const holder = project.parts.find((part) =>
    part.features.some((feature) => featureKey(feature.id) === active),
  );
  const tabStop = rows.some((row) => row.key === active)
    ? active
    : holder !== undefined
      ? partKey(holder.id)
      : rows[0]!.key;
  const holes = holeCounts(project);

  const setOpen = (partId: PartId, open: boolean): void =>
    setClosed((was) => {
      const next = new Set(was);
      if (open) next.delete(partId);
      else next.add(partId);
      return next;
    });

  const selectRow = (row: TreeRow): void => {
    if (row.kind === 'part') store.selectParts([row.id]);
    else store.select([row.id]);
  };

  const focusRow = (key: string): void => {
    setActive(key);
    const find = () =>
      tree.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;
    // At once when it is drawn; after the next render when a fold is just showing it.
    const shown = find();
    if (shown !== null) shown.focus();
    else requestAnimationFrame(() => find()?.focus());
  };

  const toggleVisible = (row: TreeRow): void => {
    const part = project.parts.find((entry) => entry.id === row.partId);
    if (part === undefined) return;
    if (row.kind === 'part') {
      store.dispatch(setPartVisible(part.id, !isPartVisible(part)));
      return;
    }
    const feature = part.features.find((entry) => entry.id === row.id);
    if (feature !== undefined) store.dispatch(setFeatureVisible([feature.id], !feature.visible));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // A row's own keys, from the row: a name being typed, or a button in the
    // row pressed by its key, keeps them.
    const target = event.target as HTMLElement;
    if (isTyping(target) || target.getAttribute('role') !== 'treeitem') return;
    const row = rows.find((entry) => entry.key === target.dataset['key']);
    if (row === undefined) return;
    const heard = (id: CommandId): boolean =>
      keysOf(id).some((binding) => matches(event, binding, IS_MAC));
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (event.key === 'Enter' && plain) {
      // As the row's button did: it selects, and the key goes on.
      selectRow(row);
      return;
    }
    if (heard('toggleVisible')) toggleVisible(row);
    else if (heard('rename')) setRenaming(row.key);
    else {
      const move = plain ? treeMove(rows, row.key, event.key) : null;
      if (move === null) return;
      if ('open' in move) setOpen(move.open, true);
      else if ('close' in move) setOpen(move.close, false);
      else {
        // Selection follows focus, as in a file manager: Delete then deletes
        // the row the maker is on.
        const next = rows.find((entry) => entry.key === move.focus);
        if (next !== undefined) selectRow(next);
        focusRow(move.focus);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const rowProps = (row: TreeRow, label: string): TreeItem => ({
    role: 'treeitem',
    'data-key': row.key,
    'aria-level': row.level,
    'aria-posinset': row.position,
    'aria-setsize': row.siblings,
    'aria-label': label,
    ...(row.expanded === undefined ? {} : { 'aria-expanded': row.expanded }),
    tabIndex: row.key === tabStop ? 0 : -1,
    onFocus: (event) => {
      if (event.target === event.currentTarget) setActive(row.key);
    },
  });

  const finishRename = (row: TreeRow, name: string | null, how: 'keyboard' | 'blur'): void => {
    setRenaming(null);
    const next = name?.trim() ?? '';
    if (next !== '') {
      const part = project.parts.find((entry) => entry.id === row.partId);
      const was =
        row.kind === 'part'
          ? part?.name
          : part?.features.find((feature) => feature.id === row.id)?.name;
      if (next !== was) {
        store.dispatch(
          row.kind === 'part' ? setPartName(row.id, next) : renameFeature(row.id, next),
        );
      }
    }
    if (how === 'keyboard') focusRow(row.key);
  };

  return (
    <aside
      className="panel parts"
      tabIndex={-1}
      data-testid="parts-list"
      aria-label={t('parts.title')}
    >
      <PartsTitle toggle={toggle} count={project.parts.length} />
      <div
        ref={tree}
        role="tree"
        className="parts-tree"
        aria-label={t('parts.title')}
        onKeyDown={onKeyDown}
      >
        {project.parts.map((part) => {
          const own = rows.filter((row) => row.partId === part.id);
          const heading = own[0]!;
          const status = printStatus.get(part.id) ?? null;
          return (
            <section
              key={part.id}
              role="none"
              className={['part', selectedParts.has(part.id) ? 'selected' : '']
                .filter((name) => name !== '')
                .join(' ')}
              data-testid={`part-section-${part.id}`}
            >
              <PieceRow
                store={store}
                project={project}
                part={part}
                status={status}
                isSelected={selectedParts.has(part.id)}
                badges={badges}
                treeProps={rowProps(
                  heading,
                  rowName(
                    {
                      name: pieceName(part, t),
                      problems: badges.parts.get(part.id) ?? null,
                      holes: null,
                      empty: part.features.length === 0,
                    },
                    i18n,
                  ),
                )}
                renaming={renaming === heading.key}
                onRename={(name, how) => finishRename(heading, name, how)}
                onSelect={() => selectRow(heading)}
                onFold={() => setOpen(part.id, heading.expanded === false)}
                onRemovePart={onRemovePart}
                onDuplicatePart={onDuplicatePart}
                onContextMenu={onContextMenu}
              />
              {own.slice(1).map((row) => {
                const feature = part.features.find((entry) => entry.id === row.id)!;
                // Only what names this feature: a part's own problems count on
                // the part's row, not on every feature in it.
                const problems = badges.features.get(feature.id) ?? null;
                const count = holes.get(feature.id) ?? null;
                return (
                  <FeatureRow
                    key={row.key}
                    store={store}
                    feature={feature}
                    holes={count}
                    isSelected={selected.has(feature.id)}
                    problems={problems}
                    treeProps={rowProps(
                      row,
                      rowName({ name: feature.name, problems, holes: count, empty: false }, i18n),
                    )}
                    renaming={renaming === row.key}
                    onRename={(name, how) => finishRename(row, name, how)}
                    onSelect={() => selectRow(row)}
                    onContextMenu={onContextMenu}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

/** "Parts", how many pieces, and the panel's fold at the row's end. */
function PartsTitle({ toggle, count }: { toggle: ReactNode; count: number | null }) {
  const { t } = useI18n();
  return (
    <header className="panel-title">
      <h2>{t('parts.title')}</h2>
      {count !== null && (
        <span className="panel-count" data-testid="parts-count">
          {t('parts.count', { count })}
        </span>
      )}
      {toggle}
    </header>
  );
}

/** A row's part in the tree: its place, its name, and whether it is the Tab stop. */
interface TreeItem {
  readonly role: 'treeitem';
  readonly 'data-key': string;
  readonly 'aria-level': number;
  readonly 'aria-posinset': number;
  readonly 'aria-setsize': number;
  readonly 'aria-label': string;
  readonly 'aria-expanded'?: boolean;
  readonly tabIndex: number;
  readonly onFocus: (event: FocusEvent<HTMLDivElement>) => void;
}

/**
 * What a row says beyond what it shows, for a screen reader: hidden, locked,
 * where it prints. Tied to the row by `aria-describedby`, since the row's name
 * is what it shows (`rowName`).
 */
function useDescription(parts: readonly (string | null)[]): {
  id: string;
  text: string | null;
} {
  const id = useId();
  const said = parts.filter((part): part is string => part !== null);
  return { id, text: said.length === 0 ? null : said.join('. ') };
}

/**
 * A piece's row: its fold, its outline in small, its name and Cut. Only what
 * does not print says so (Q20), as a mark whose tooltip gives the reason;
 * where a piece does print is the Sheets view's panel (U.9).
 */
function PieceRow({
  store,
  project,
  part,
  status,
  isSelected,
  badges,
  treeProps,
  renaming,
  onRename,
  onSelect,
  onFold,
  onRemovePart,
  onDuplicatePart,
  onContextMenu,
}: {
  store: DocumentStore;
  project: Project;
  part: Part;
  status: PartPrintStatus | null;
  isSelected: boolean;
  badges: Badges;
  treeProps: TreeItem;
  renaming: boolean;
  onRename: (name: string | null, how: 'keyboard' | 'blur') => void;
  onSelect: () => void;
  onFold: () => void;
  onRemovePart: (partId: string) => void;
  onDuplicatePart: (partId: string) => void;
  onContextMenu: OpenMenu;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const visible = isPartVisible(part);
  const printed = status === null ? null : describePrintStatus(status, i18n);
  const notPrinted =
    status !== null && status.sheets === null && printed !== null
      ? t('parts.notPrinted', { reason: printed.note ?? '' })
      : null;
  const description = useDescription([visible ? null : t('parts.isHidden'), notPrinted]);

  return (
    <div
      {...treeProps}
      className={['tree-row piece-row', isSelected ? 'selected' : ''].join(' ').trim()}
      data-testid={`part-heading-${part.id}`}
      aria-selected={isSelected}
      aria-describedby={description.text === null ? undefined : description.id}
      // Selecting the part is what makes it the target for the next cut-out
      // or fold line, without having to pick something inside it first (§3.1).
      onClick={onSelect}
      onContextMenu={(event) => onContextMenu({ kind: 'part', id: part.id }, menuPoint(event))}
    >
      <div className="tree-line">
        <span
          className="tree-fold"
          data-testid={`part-fold-${part.id}`}
          aria-hidden
          onClick={(event) => {
            event.stopPropagation();
            onFold();
          }}
        >
          {treeProps['aria-expanded'] !== undefined && (
            <Icon of={treeProps['aria-expanded'] ? 'chevron-down' : 'chevron-right'} size={14} />
          )}
        </span>
        <PieceThumbnail project={project} part={part} />
        {renaming ? (
          <RowName name={part.name} onDone={onRename} />
        ) : (
          // The name and its ×N give way together, the ×N after the name's last word.
          <span className="part-title">
            <span className="part-label">{part.name}</span>
            {part.quantity > 1 && <span className="badge">×{part.quantity}</span>}
          </span>
        )}
        {/*
          Counting everything inside the part, its features included: a
          closed or scrolled-past piece must not be able to hide trouble.
        */}{' '}
        <CountBadge badge={badges.parts.get(part.id) ?? null} />
        <span className="row-end">
          <span className="row-actions">
            <IconToggle
              testId={`part-visible-${part.id}`}
              on={visible}
              onLabel={t('parts.hidePart')}
              offLabel={t('parts.showPart')}
              glyph={<Icon of={visible ? 'visible' : 'hidden'} />}
              keys="toggleVisible"
              persists={!visible}
              onToggle={() => store.dispatch(setPartVisible(part.id, !visible))}
            />
            <PartMenu part={part} onDuplicatePart={onDuplicatePart} onRemovePart={onRemovePart} />
          </span>
          {notPrinted !== null && (
            <Tooltip text={notPrinted}>
              <span className="row-mark not-printed" data-testid={`part-not-printed-${part.id}`}>
                <Icon of="not-printed" size={14} />
              </span>
            </Tooltip>
          )}
        </span>
      </div>{' '}
      {part.features.length === 0 && (
        // A part is removed only on purpose (ADR 0009), so an emptied one
        // stays — named, and with the way to remove it right here.
        <div className="empty-part">
          <span className="panel-empty">{t('parts.emptyPart')}</span>{' '}
          <button
            type="button"
            className="tool"
            data-testid="remove-empty-part"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onRemovePart(part.id);
            }}
          >
            {t('parts.remove')}
          </button>
        </div>
      )}
      {description.text !== null && (
        <span id={description.id} className="visually-hidden">
          {description.text}
        </span>
      )}
    </div>
  );
}

/**
 * A part's own actions, behind one small button on its row: Duplicate and
 * Delete (§7.1). The right-click menu has both too, and is how the keyboard
 * reaches them from a row.
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
  const { t } = useI18n();
  return (
    <span className="row-menu" onClick={(event) => event.stopPropagation()}>
      <MenuButton
        label={t('parts.actions', { name: part.name })}
        testId={`part-menu-${part.id}`}
        className="icon-toggle"
        align="end"
        tabIndex={-1}
        entries={[
          {
            kind: 'item',
            id: `duplicate-part-${part.id}`,
            label: t('actions.duplicate'),
            icon: 'duplicate',
            note: t('parts.duplicateNote'),
            onChoose: () => onDuplicatePart(part.id),
          },
          ...(part.features.length > 0
            ? [
                {
                  kind: 'item' as const,
                  id: `delete-part-${part.id}`,
                  label: t('actions.deletePart'),
                  icon: 'delete' as const,
                  danger: true,
                  onChoose: () => onRemovePart(part.id),
                },
              ]
            : []),
        ]}
      >
        <Icon of="more" />
      </MenuButton>
    </span>
  );
}

/**
 * One feature's row, indented under what it follows with an elbow, its hole
 * count at the right for a hole set. Lock and eye show on hover and keyboard
 * focus, and stay while they are on.
 */
function FeatureRow({
  store,
  feature,
  holes,
  isSelected,
  problems,
  treeProps,
  renaming,
  onRename,
  onSelect,
  onContextMenu,
}: {
  store: DocumentStore;
  feature: Feature;
  holes: number | null;
  isSelected: boolean;
  problems: Badge | null;
  treeProps: TreeItem;
  renaming: boolean;
  onRename: (name: string | null, how: 'keyboard' | 'blur') => void;
  onSelect: () => void;
  onContextMenu: OpenMenu;
}) {
  const { t, locale } = useI18n();
  const description = useDescription([
    feature.visible ? null : t('parts.isHidden'),
    feature.locked ? t('parts.isLocked') : null,
  ]);

  return (
    <div
      {...treeProps}
      className={['tree-row feature-row', isSelected ? 'selected' : ''].join(' ').trim()}
      style={{ '--level': treeProps['aria-level'] - 1 } as CSSProperties}
      data-testid={`feature-row-${feature.id}`}
      aria-selected={isSelected}
      aria-describedby={description.text === null ? undefined : description.id}
      // A locked feature is still selectable here, deliberately: it is out of
      // hit-testing on the canvas, so this is the only way to reach it and
      // unlock it (F.2).
      onClick={onSelect}
      // Locked and hidden ones too: this is where they are reached.
      onContextMenu={(event) =>
        onContextMenu({ kind: 'feature', id: feature.id }, menuPoint(event))
      }
    >
      <div className="tree-line">
        <span className="tree-elbow" aria-hidden />
        <MarkOf feature={feature} />
        {renaming ? (
          <RowName name={feature.name} onDone={onRename} />
        ) : (
          <span className="feature-name">{feature.name}</span>
        )}{' '}
        <CountBadge badge={problems} />{' '}
        {holes !== null && (
          // Formatted as its name says it, so the two read alike: 1,146.
          <span className="row-count" data-testid={`hole-count-${feature.id}`}>
            {new Intl.NumberFormat(locale).format(holes)}
          </span>
        )}
        <span className="row-end">
          <span className="row-actions">
            <IconToggle
              testId={`feature-locked-${feature.id}`}
              on={feature.locked}
              onLabel={t('actions.unlock')}
              offLabel={t('actions.lock')}
              glyph={<Icon of={feature.locked ? 'locked' : 'unlocked'} />}
              persists={feature.locked}
              onToggle={() => store.dispatch(setFeatureLocked([feature.id], !feature.locked))}
            />
            <IconToggle
              testId={`feature-visible-${feature.id}`}
              on={feature.visible}
              onLabel={t('actions.hide')}
              offLabel={t('actions.show')}
              glyph={<Icon of={feature.visible ? 'visible' : 'hidden'} />}
              keys="toggleVisible"
              persists={!feature.visible}
              onToggle={() => store.dispatch(setFeatureVisible([feature.id], !feature.visible))}
            />
          </span>
          {isMirroredFeature(feature) && (
            // A counterpart already nests under its original here, but the
            // nesting alone reads the same as a stitch line's. This says which
            // relationship it is, in the width of one glyph — always shown.
            <Tooltip text={t('parts.mirrorsMark')}>
              <span className="row-mark" data-testid={`mirrored-mark-${feature.id}`}>
                {isFoldMirrored(feature) ? (
                  <FeatureMark mark="mirror-across-fold" size={14} />
                ) : (
                  <Icon of={MIRROR_ICON.horizontal} size={14} />
                )}
              </span>
            </Tooltip>
          )}
        </span>
      </div>
      {description.text !== null && (
        <span id={description.id} className="visually-hidden">
          {description.text}
        </span>
      )}
    </div>
  );
}

/**
 * A row's name being changed (F2): Enter or leaving keeps it, Escape puts it
 * back, and the whole change is one step of undo — as the project's name is
 * renamed (U.7).
 */
function RowName({
  name,
  onDone,
}: {
  name: string;
  onDone: (next: string | null, how: 'keyboard' | 'blur') => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (next: string | null, how: 'keyboard' | 'blur'): void => {
    if (done.current) return;
    done.current = true;
    onDone(next, how);
  };
  return (
    <input
      ref={input}
      className="row-name-input"
      data-testid="row-name-input"
      aria-label={t('parts.rename')}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(draft, 'keyboard');
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          finish(null, 'keyboard');
        }
      }}
      onBlur={(event) => {
        // The field's own menu is not leaving it (U.20).
        if (!intoMenu(event.relatedTarget)) finish(draft, 'blur');
      }}
    />
  );
}

type OpenMenu = (clicked: RightClicked, at: { x: number; y: number }) => void;

/**
 * Where a row's right-click menu opens: at the pointer. The Menu key and
 * Shift+F10 on a focused row arrive here too, with a point on the row.
 */
function menuPoint(event: MouseEvent<HTMLElement>): { x: number; y: number } {
  event.preventDefault();
  return { x: event.clientX, y: event.clientY };
}

/** The row Tab reaches after a selection: the first selected, in the tree's order. */
function firstSelected(
  parts: readonly Part[],
  selected: ReadonlySet<string>,
  selectedParts: ReadonlySet<string>,
): string | null {
  for (const part of parts) {
    if (selectedParts.has(part.id)) return partKey(part.id);
    const feature = part.features.find((entry) => selected.has(entry.id));
    if (feature !== undefined) return featureKey(feature.id);
  }
  return null;
}

/** Each hole set's count of holes, as evaluation made it; a set that failed has none. */
function holeCounts(project: Project): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { features } of resolvedFor(project).parts) {
    for (const entry of features) {
      if (entry.ok && entry.holes !== undefined) counts.set(entry.feature.id, entry.holes.count);
    }
  }
  return counts;
}

/** Whether a counterpart is mirrored across a fold, rather than a fixed axis. */
function isFoldMirrored(feature: Feature): boolean {
  return (
    feature.kind !== 'text-label' &&
    feature.source.kind === 'derived' &&
    feature.source.op.type === 'mirror' &&
    feature.source.op.axis.kind === 'fold'
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

/**
 * A small on/off control that says what pressing it would do. Out of the Tab
 * order — the row is the tree's one stop, and Space and the right-click menu
 * do what these do from the keyboard. Pressed by the pointer, it lets go of
 * focus (U.4).
 */
function IconToggle({
  testId,
  on,
  onLabel,
  offLabel,
  glyph,
  keys,
  persists = false,
  onToggle,
}: {
  testId: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  glyph: ReactNode;
  keys?: CommandId;
  /** Shown at rest too: a state the maker should see — hidden, locked (R-07). */
  persists?: boolean;
  onToggle: () => void;
}) {
  const label = on ? onLabel : offLabel;

  return (
    <Tooltip text={label} {...(keys === undefined ? {} : { keys })}>
      <button
        type="button"
        className={['icon-toggle', on ? '' : 'off', persists ? 'persists' : '']
          .filter((name) => name !== '')
          .join(' ')}
        data-testid={testId}
        aria-pressed={on}
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          pressOf(event);
          onToggle();
        }}
      >
        {glyph}
      </button>
    </Tooltip>
  );
}
