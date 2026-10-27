import type { DocumentStore } from '@leathercad/document';
import type { Part, Project } from '@leathercad/domain';
import type { PartPrintStatus } from '@leathercad/export';
import type { ReactNode } from 'react';

import type { I18n } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { ToolIcon } from './icons/ToolIcon.js';
import { PaperFields } from './PaperButton.js';
import { PieceThumbnail, pieceName } from './PanelFold.js';
import {
  describePrintStatus,
  describeSheetNumbers,
  describeSheetNumbersOnly,
  describeTapedAcross,
} from './sheetWords.js';
import { placementOf, sheetContents, tapedPieces } from './sheetContents.js';
import { sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/**
 * The Sheets view's own panels (U.9, R-08): Parts as the sheets and what is on
 * each, Properties as the paper and where the picked piece prints.
 *
 * The maker here is checking paper, not drawing: which sheet each piece lands
 * on, whether anything is taped, and the reminder to measure the box before
 * cutting leather. Every number is read from `sheetPlanFor` — the plan the PDF
 * writes (7.4a) — through `sheetContents.ts`; nothing is paginated again, and
 * nothing here is stored (invariant 4).
 */

/** "Parts", and how many sheets it is spread over, with the panel's fold. */
function Title({ count, toggle }: { count: number; toggle: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="panel-title">
      <h2>{t('parts.title')}</h2>
      <span className="panel-count" data-testid="parts-count">
        {t('sheetsView.sheetCount', { count })}
      </span>
      {toggle}
    </header>
  );
}

export function SheetsParts({
  store,
  project,
  printStatus,
  selected,
  hoveredPart,
  onHoverPart,
  toggle,
}: {
  store: DocumentStore;
  project: Project;
  /** Where each part prints and what of it does not: the plan's, from `printStatusFor`. */
  printStatus: ReadonlyMap<string, PartPrintStatus>;
  /** The parts selected, or holding a selected feature. */
  selected: ReadonlySet<string>;
  /** A piece under the pointer on the sheets: lit here too (7.4d). */
  hoveredPart: string | null;
  onHoverPart: (partId: string | null) => void;
  toggle?: ReactNode;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const sheets = sheetContents(plan);
  const taped = tapedPieces(plan);
  const partOf = new Map<string, Part>(project.parts.map((part) => [part.id, part]));
  const notPrinted = project.parts.filter((part) => printStatus.get(part.id)?.sheets === null);
  const anyTurned = sheets.some((sheet) => sheet.pieces.some((piece) => piece.turned));

  const row = (partId: string, key: string, suffix: ReactNode): ReactNode => {
    const part = partOf.get(partId);
    if (part === undefined) return null;
    const status = printStatus.get(partId) ?? null;
    const note = status === null ? null : describePrintStatus(status, i18n).note;
    return (
      <li key={key}>
        <button
          type="button"
          className={[
            'sheets-piece',
            selected.has(partId) ? 'selected' : '',
            hoveredPart === partId ? 'hovered' : '',
          ]
            .filter((name) => name !== '')
            .join(' ')}
          data-testid={`sheets-piece-${key}`}
          aria-pressed={selected.has(partId)}
          onClick={() => store.selectParts([partId])}
          onMouseEnter={() => onHoverPart(partId)}
          onMouseLeave={() => onHoverPart(null)}
        >
          <span className="sheets-piece-line">
            <PieceThumbnail project={project} part={part} />
            <span className="part-label">{pieceName(part, t)}</span>
            {suffix}
          </span>
          {note !== null && (
            <span className="part-print-note" data-testid={`sheets-piece-note-${key}`}>
              {note}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <aside
      className="panel parts sheets-parts"
      tabIndex={-1}
      data-testid="sheets-parts"
      aria-label={t('parts.title')}
    >
      <Title count={sheets.length} toggle={toggle} />
      <div className="sheets-list">
        {sheets.map((sheet) => (
          <section
            key={sheet.number}
            className="sheets-group"
            data-testid={`sheets-group-${String(sheet.number)}`}
            aria-labelledby={`sheets-group-heading-${String(sheet.number)}`}
          >
            <h3
              className="sheets-group-heading"
              id={`sheets-group-heading-${String(sheet.number)}`}
            >
              <span>{t('status.sheetOf', { number: sheet.number, count: sheet.count })}</span>
              <span className="sheets-group-count">
                {sheet.assemblyOf !== null
                  ? t('sheetsView.assembly', { name: sheet.assemblyOf })
                  : sheet.pieces.length === 0
                    ? t('sheetsView.noPieces')
                    : t('parts.count', { count: sheet.pieces.length })}
              </span>
            </h3>
            <ul className="sheets-pieces">
              {sheet.pieces.map((piece) =>
                row(
                  piece.partId,
                  `${piece.partId}-${String(sheet.number)}`,
                  piece.turned ? (
                    <Tooltip text={t('sheetsView.turnedMark')}>
                      <span
                        className="row-mark turned"
                        data-testid={`sheets-turned-${piece.partId}`}
                        role="img"
                        aria-label={t('sheetsView.turnedMark')}
                      >
                        <ToolIcon toolId="rotate" size={14} />
                      </span>
                    </Tooltip>
                  ) : piece.taped ? (
                    <span className="badge">{t('sheetsView.tapedMark')}</span>
                  ) : null,
                ),
              )}
            </ul>
          </section>
        ))}

        {notPrinted.length > 0 && (
          <section className="sheets-group" data-testid="sheets-not-printed">
            <h3 className="sheets-group-heading">
              <span>{t('sheetsView.notPrintedHeading')}</span>
            </h3>
            <ul className="sheets-pieces">
              {notPrinted.map((part) => {
                const status = printStatus.get(part.id)!;
                return row(
                  part.id,
                  `${part.id}-none`,
                  <span className="part-print-note">
                    {t(`print.reason.${status.notPrinted!}`)}
                  </span>,
                );
              })}
            </ul>
          </section>
        )}

        <section className="sheets-group" data-testid="sheets-taped">
          <h3 className="sheets-group-heading">
            <span>{t('sheetsView.tapedHeading')}</span>
          </h3>
          {taped.length === 0 ? (
            <p className="panel-empty" data-testid="sheets-taped-none">
              {t('sheetsView.tapedNone')}
            </p>
          ) : (
            <ul className="sheets-pieces">
              {taped.map((entry) => (
                <li key={entry.partId} className="sheets-taped-entry">
                  <span className="part-label">{entry.name}</span>
                  <span className="sheets-group-count" data-testid={`sheets-taped-${entry.partId}`}>
                    {describeSheetNumbers(entry.sheets, i18n)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {anyTurned && (
          <p className="panel-empty sheets-legend">
            <ToolIcon toolId="rotate" size={12} /> {t('sheetsView.turnedLegend')}
          </p>
        )}
      </div>
    </aside>
  );
}

/**
 * The paper, then where the picked piece prints, then the reminder to measure
 * (R-08). Paper and orientation are the paper button's own fields, so a
 * change here is the same one undo step.
 */
export function SheetsProperties({
  store,
  project,
  selected,
  toggle,
}: {
  store: DocumentStore;
  project: Project;
  /** The parts selected, or holding a selected feature. */
  selected: ReadonlySet<string>;
  toggle?: ReactNode;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const picked = project.parts.filter((part) => selected.has(part.id));

  return (
    <aside
      className="panel properties sheets-properties"
      tabIndex={-1}
      data-testid="sheets-properties"
      aria-label={t('properties.title')}
    >
      <header className="panel-header">
        <h2 className="header-name">{t('view.sheets')}</h2>
        {toggle}
      </header>

      <section className="panel-group" data-testid="sheets-paper-group">
        <div className="panel-heading">{t('sheets.paper')}</div>
        <PaperFields project={project} store={store} testPrefix="sheets-" />
        <Fact label={t('properties.job.sheets')} testId="sheets-count">
          {plan.sheets.length}
        </Fact>
        <Fact label={t('sheetsView.scale')} testId="sheets-scale">
          {t('sheetsView.scaleLocked')}
        </Fact>
      </section>

      {picked.length > 1 && (
        <p className="panel-empty" data-testid="sheets-many">
          {t('sheetsView.manySelected', { count: picked.length })}
        </p>
      )}
      {picked.length === 1 && <PieceOnSheets project={project} part={picked[0]!} i18n={i18n} />}

      <p className="panel-note sheets-measure" data-testid="sheets-measure">
        <Icon of="ruler" size={14} /> {t('sheetsView.measure')}
      </p>
    </aside>
  );
}

function Fact({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="field" data-testid={testId}>
      <span className="field-label">{label}</span>
      <span className="field-value">{children}</span>
    </div>
  );
}

/** The picked piece's sheet, placement and fit — each the plan's own answer. */
function PieceOnSheets({ project, part, i18n }: { project: Project; part: Part; i18n: I18n }) {
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const placed = placementOf(plan, part.id);
  const count = plan.sheets.length;

  return (
    <section className="panel-group" data-testid="sheets-piece">
      <div className="panel-heading">
        {part.name}
        <span className="sheets-on">{t('sheetsView.onTheSheets')}</span>
      </div>
      {placed === null ? (
        <p className="panel-empty" data-testid="sheets-piece-not-printed">
          {t('print.notPrinted')}
        </p>
      ) : (
        <>
          <Fact
            label={t('sheetsView.sheet', { count: placed.sheets.length })}
            testId="sheets-piece-sheet"
          >
            {t('sheetsView.sheetsOf', {
              sheets: describeSheetNumbersOnly(placed.sheets, i18n),
              count,
            })}
          </Fact>
          <Fact label={t('sheetsView.placement')} testId="sheets-piece-placement">
            {placed.taped
              ? t('sheetsView.taped')
              : placed.turned
                ? t('sheetsView.turned')
                : t('sheetsView.asDrawn')}
          </Fact>
          <p className="sheets-fit" data-testid="sheets-piece-fit">
            <Icon of="check" size={14} />{' '}
            {placed.taped
              ? describeTapedAcross(part.name, placed.sheets, i18n)
              : t('sheetsView.fitsOne')}
          </p>
        </>
      )}
    </section>
  );
}
