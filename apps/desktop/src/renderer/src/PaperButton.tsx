import { formatEditable } from '@leathercad/core';
import { setPageSetup, type DocumentStore } from '@leathercad/document';
import { PAPER_SIZES, type Orientation, type PaperName, type Project } from '@leathercad/domain';
import { contentAreaMm, type SheetPlan } from '@leathercad/export';
import { useEffect, useId, useRef, useState } from 'react';

import type { Translate } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { KeyCap } from './keyCaps.js';
import type { Room } from './panelLayout.js';
import { describeChoice, describeSheets, describeTaped } from './sheetWords.js';
import { paperOptionsFor, sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

const mm = (value: number): string => formatEditable(value, 1);

/** The sheet and what of it prints, for the indicator's tooltip. */
function physicalFacts(plan: SheetPlan, t: Translate): string {
  const { paper } = plan.setup;
  const area = contentAreaMm(plan.setup);
  const size = PAPER_SIZES[paper.name as PaperName];
  return t('sheets.physical', {
    paper: paper.name,
    width: mm(size.widthMm),
    height: mm(size.heightMm),
    printWidth: mm(area.widthMm),
    printHeight: mm(area.heightMm),
  });
}

const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];

/**
 * The paper, said as what it produces (7.4a, R-06): a quiet button reading
 * **"2 × A4 portrait"** — "2 × A4" in a narrow window, "2" in a cramped one —
 * that opens the page setup over the bar: the paper, which way up, what it
 * comes to, and the way to the sheets.
 *
 * Every paper in the list says how many sheets it takes, and each way up says
 * in its tooltip, read from the sheet plan for that choice, so the maker sees
 * before choosing that A4 landscape takes one sheet where portrait takes two.
 * Choosing is `setPageSetup`: one edit, one undo step. The plan shown is the
 * one Export PDF writes (`sheetPlanFor`), so the number here is the PDF's page
 * count by construction — and the Sheets tab's, and Properties' totals'.
 *
 * Not a menu: it holds a list and buttons. It takes focus as it opens, closes
 * on Escape — giving focus back to the button — on a press outside, or when
 * focus leaves it.
 */
export function PaperButton({
  project,
  store,
  room,
  onSeeSheets,
}: {
  project: Project;
  store: DocumentStore;
  room: Room;
  onSeeSheets: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const ids = useId();
  const plan = sheetPlanFor(project);
  const { paper, orientation } = project.settings;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // Escape gives focus back to the button once the popover has closed: the
  // tooltip is off while it is open, which changes the button's wrapping, so
  // the button before the render is not the one after (as `MenuButton`'s).
  const giveBack = useRef(false);
  const close = (back: boolean): void => {
    giveBack.current = back;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      if (giveBack.current) button.current?.focus();
      giveBack.current = false;
      return;
    }
    popover.current?.querySelector<HTMLElement>('select')?.focus();
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const count = plan.sheets.length;
  const orientationWord = t(`sheets.orientation.${orientation}`);
  const face =
    room === 'cramped'
      ? String(count)
      : room === 'narrow'
        ? t('projectBar.paperShort', { count, paper })
        : t('projectBar.paperLong', { count, paper, orientation: orientationWord });

  return (
    <div className="menu-anchor" ref={root}>
      <Tooltip text={open ? null : physicalFacts(plan, t)}>
        <button
          ref={button}
          type="button"
          className="tool quiet paper-button"
          data-testid="paper-button"
          data-sheets={count}
          aria-label={t('projectBar.paper', { sheets: describeSheets(plan, t) })}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${ids}popover` : undefined}
          onClick={() => setOpen((was) => !was)}
        >
          <Icon of="paper" />
          <span className="paper-face">{face}</span>
          <Icon of="chevron-down" size={12} />
        </button>
      </Tooltip>
      {open && (
        <div
          ref={popover}
          id={`${ids}popover`}
          className="popover paper-popover end"
          role="dialog"
          aria-label={t('sheets.paper')}
          data-testid="paper-popover"
          onKeyDown={(event) => {
            // Keys in it are its own: a letter must not change the tool behind it.
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            }
          }}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          <PaperFields project={project} store={store} />
          <p className="paper-summary" data-testid="paper-summary">
            <SheetGlyph plan={plan} />
            {t('projectBar.paperPopover.summary', {
              sheets: t('projectBar.paperPopover.sheets', { count }),
              taped: describeTaped(plan, i18n) ?? t('projectBar.paperPopover.nothingTaped'),
            })}
          </p>
          <button
            type="button"
            className="tool"
            data-testid="see-sheets"
            onClick={() => {
              setOpen(false);
              onSeeSheets();
            }}
          >
            {t('projectBar.paperPopover.seeSheets')}
            <KeyCap command="sheets" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The paper and which way up, as the page setup edits them: a list of papers
 * each saying how many sheets it takes, and the two orientations each saying
 * what it comes to — read from the sheet plan for that choice. In the paper
 * button's popover, and in Properties on the Sheets view (U.9), where
 * `testPrefix` keeps the two apart.
 */
export function PaperFields({
  project,
  store,
  testPrefix = '',
}: {
  project: Project;
  store: DocumentStore;
  testPrefix?: string;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const ids = useId();
  const { paper, orientation } = project.settings;
  const options = paperOptionsFor(project);
  const choiceOf = (way: Orientation) =>
    options.find((option) => option.paper === paper && option.orientation === way);

  return (
    <>
      <label className="field">
        <span className="field-label">{t('sheets.paper')}</span>
        <select
          data-testid={`${testPrefix}paper`}
          value={paper}
          onChange={(event) =>
            store.dispatch(setPageSetup(event.target.value as PaperName, orientation))
          }
        >
          {options
            .filter((option) => option.orientation === orientation)
            .map((option) => (
              <option key={option.paper} value={option.paper}>
                {t('projectBar.paperPopover.option', {
                  paper: option.paper,
                  count: option.plan.sheets.length,
                })}
              </option>
            ))}
        </select>
      </label>
      <div className="field" role="group" aria-labelledby={`${ids}orientation`}>
        <span className="field-label" id={`${ids}orientation`}>
          {t('projectBar.paperPopover.orientation')}
        </span>
        <span className="segmented">
          {ORIENTATIONS.map((way) => {
            const choice = choiceOf(way);
            return (
              <Tooltip
                key={way}
                text={choice === undefined ? null : describeChoice(choice.plan, i18n)}
              >
                <button
                  type="button"
                  className={orientation === way ? 'segment active' : 'segment'}
                  data-testid={`${testPrefix}paper-${way}`}
                  aria-pressed={orientation === way}
                  onClick={() => store.dispatch(setPageSetup(paper, way))}
                >
                  {t(`printPreview.${way}`)}
                </button>
              </Tooltip>
            );
          })}
        </span>
      </div>
    </>
  );
}

/** Drawn sheets: at most this many, then a count. */
const GLYPH_SHEETS = 4;
const GLYPH_LONG_PX = 14;
const GLYPH_GAP_PX = 3;

/**
 * The sheets themselves, small: one outline per sheet at the paper's true
 * proportions and way up, and a taped piece's sheets drawn touching, with the
 * join between them dashed. It changes the moment the paper or the pattern
 * does, which is the point — the consequence, not the setting.
 */
function SheetGlyph({ plan }: { plan: SheetPlan }) {
  const { paper, orientation } = plan.setup;
  const tall = orientation === 'portrait';
  const ratio = Math.min(paper.widthMm, paper.heightMm) / Math.max(paper.widthMm, paper.heightMm);
  const w = tall ? GLYPH_LONG_PX * ratio : GLYPH_LONG_PX;
  const h = tall ? GLYPH_LONG_PX : GLYPH_LONG_PX * ratio;

  const shown = plan.sheets.slice(0, GLYPH_SHEETS);
  const more = plan.sheets.length - shown.length;
  let x = 0.5;
  const rects: { x: number; joined: boolean }[] = [];
  shown.forEach((sheet, i) => {
    const previous = shown[i - 1];
    // Two tiles of one part touch: they are one piece of pattern, taped.
    const joined =
      previous?.tile !== undefined &&
      sheet.tile !== undefined &&
      previous.tile.part === sheet.tile.part;
    if (i > 0) x += joined ? w : w + GLYPH_GAP_PX;
    rects.push({ x, joined });
  });
  const width = Math.ceil(x + w + 1 + (more > 0 ? 14 : 0));

  return (
    <svg
      className="sheet-glyph"
      data-testid="sheet-glyph"
      data-sheets={plan.sheets.length}
      width={width}
      height={GLYPH_LONG_PX + 2}
      viewBox={`0 0 ${String(width)} ${String(GLYPH_LONG_PX + 2)}`}
      aria-hidden="true"
    >
      {rects.map((rect, i) => (
        <g key={i}>
          <rect
            x={rect.x}
            y={0.5 + (GLYPH_LONG_PX - h) / 2}
            width={w}
            height={h}
            rx={1}
            className="sheet-glyph-sheet"
          />
          {rect.joined && (
            <line
              x1={rect.x}
              x2={rect.x}
              y1={0.5 + (GLYPH_LONG_PX - h) / 2}
              y2={0.5 + (GLYPH_LONG_PX + h) / 2}
              className="sheet-glyph-join"
            />
          )}
        </g>
      ))}
      {more > 0 && (
        <text x={x + w + 2} y={GLYPH_LONG_PX - 2} className="sheet-glyph-more">
          +{more}
        </text>
      )}
    </svg>
  );
}
