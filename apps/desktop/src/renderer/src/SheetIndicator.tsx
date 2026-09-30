import { formatEditable } from '@leathercad/core';
import { setPageSetup, type DocumentStore } from '@leathercad/document';
import { PAPER_SIZES, type Orientation, type PaperName, type Project } from '@leathercad/domain';
import { contentAreaMm, type SheetPlan } from '@leathercad/export';

import type { Translate } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { describeChoice } from './sheetWords.js';
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

/**
 * The paper, said as what it produces (7.4a): **"3 sheets of A4, portrait"**,
 * not `A4 · 210 × 297 mm`.
 *
 * Every entry in the list is a paper and orientation worded as its own result,
 * read from the sheet plan for that paper, so the maker sees before choosing
 * that A4 landscape takes one sheet where portrait takes three. Choosing one is
 * `setPageSetup`: one edit, one undo step. The chosen entry's plan is the one
 * Export PDF writes (`sheetPlanFor`), so the number here is the PDF's page
 * count by construction.
 */
export function SheetIndicator({ project, store }: { project: Project; store: DocumentStore }) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const { paper, orientation } = project.settings;

  return (
    <div
      className="sheet-indicator"
      role="group"
      aria-label={t('sheets.paper')}
      data-testid="paper-control"
    >
      <SheetGlyph plan={plan} />
      <Tooltip text={physicalFacts(plan, t)}>
        <select
          className="sheet-select"
          data-testid="paper"
          aria-label={t('sheets.paperAndSheets')}
          value={`${paper} ${orientation}`}
          onChange={(event) => {
            const [name, turn] = event.target.value.split(' ') as [PaperName, Orientation];
            store.dispatch(setPageSetup(name, turn));
          }}
        >
          {paperOptionsFor(project).map((option) => (
            <option
              key={`${option.paper} ${option.orientation}`}
              value={`${option.paper} ${option.orientation}`}
            >
              {describeChoice(option.plan, i18n)}
            </option>
          ))}
        </select>
      </Tooltip>
    </div>
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
