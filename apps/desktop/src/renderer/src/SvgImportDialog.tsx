import type { DrawnPiece } from '@leathercad/document';
import type { SvgElement } from '@leathercad/import';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useI18n } from './i18n.js';
import {
  contentsText,
  DENSITIES,
  densityOf,
  leftOutLines,
  readSvg,
  refusalText,
  type Density,
  type SvgReading,
} from './svgImport.js';
import { overallOf, templatePreview } from './templatePreview.js';

/** Where the maker chose to put the pieces. */
export type ImportTarget = 'open' | 'new';

/**
 * The import preview (9.20b): an SVG's pieces as they will arrive, at the
 * size they will be cut, the scale that size came from, and what was left
 * out, by kind and count. Nothing reaches a project until *Import*: then one
 * command, one undo step, into the open project or a new one.
 *
 * A file with no unit asks for its density, with nothing chosen unless the
 * file says who drew it: the size is never guessed.
 */
export function SvgImportDialog({
  tree,
  name,
  canImportIntoOpen,
  onImport,
  onCancel,
}: {
  tree: SvgElement;
  /** The file's name, which names the pieces. */
  name: string;
  /** False on the start screen, with no project open. */
  canImportIntoOpen: boolean;
  onImport: (pieces: readonly DrawnPiece[], target: ImportTarget) => void;
  onCancel: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const ids = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  const [density, setDensity] = useState<Density | null>(() => densityOf(tree));
  const reading = useMemo(() => readSvg(tree, name, density), [tree, name, density]);
  const asksDensity =
    reading.kind === 'needs-density' || (reading.kind === 'read' && reading.scale !== 'file');
  const pieces = reading.kind === 'read' ? reading.pieces : [];

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog export-dialog svg-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}title`}
        data-testid="svg-import-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={`${ids}title`}>{t('svgImport.title', { name })}</h2>
        {asksDensity && (
          <fieldset>
            <legend>{t('svgImport.askDensity')}</legend>
            {DENSITIES.map((each) => (
              <label key={each} className="export-choice">
                <input
                  type="radio"
                  name={`${ids}density`}
                  data-testid={`svg-import-density-${String(each)}`}
                  checked={density === each}
                  onChange={() => setDensity(each)}
                />
                <span>{t(each === 96 ? 'svgImport.scale96' : 'svgImport.scale72')}</span>
              </label>
            ))}
          </fieldset>
        )}
        {reading.kind === 'refused' && <p role="alert">{refusalText(reading.error, i18n)}</p>}
        {reading.kind === 'read' && <Preview reading={reading} />}
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="tool"
            data-testid="svg-import-cancel"
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool"
            data-testid="svg-import-new"
            disabled={pieces.length === 0}
            onClick={() => onImport(pieces, 'new')}
          >
            {t('svgImport.asNew')}
          </button>
          {canImportIntoOpen && (
            <button
              type="button"
              className="tool primary"
              data-testid="svg-import-open"
              disabled={pieces.length === 0}
              onClick={() => onImport(pieces, 'open')}
            >
              {t('svgImport.intoProject')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Preview({ reading }: { reading: Extract<SvgReading, { kind: 'read' }> }) {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const drawing = useMemo(
    () => templatePreview(reading.project, 360, 200, 'full'),
    [reading.project],
  );
  const overall = overallOf(reading.project);
  const mm = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contents = contentsText(reading.pieces, i18n);
  const leftOut = leftOutLines(reading, i18n);
  const count = reading.pieces.length;

  if (count === 0) return <p data-testid="svg-import-empty">{t('svgImport.noPieces')}</p>;
  return (
    <>
      <span className="template-preview large" aria-hidden="true">
        {drawing !== null && <img src={drawing} alt="" width={360} height={200} />}
      </span>
      <dl className="template-facts" data-testid="svg-import-facts">
        {overall !== null && (
          <>
            <dt>{t('svgImport.size')}</dt>
            <dd data-testid="svg-import-size">
              {t('svgImport.sizeValue', {
                width: mm.format(overall.width),
                height: mm.format(overall.height),
              })}
            </dd>
          </>
        )}
        <dt>{t('svgImport.scale')}</dt>
        <dd>
          {t(
            reading.scale === 'file'
              ? 'svgImport.scaleFile'
              : reading.scale === 96
                ? 'svgImport.scale96'
                : 'svgImport.scale72',
          )}
        </dd>
        <dt>{t('svgImport.pieces')}</dt>
        <dd data-testid="svg-import-pieces">{t('svgImport.piecesValue', { count })}</dd>
        {contents !== null && (
          <>
            <dt>{t('svgImport.contents')}</dt>
            <dd data-testid="svg-import-contents">{contents}</dd>
          </>
        )}
      </dl>
      {reading.pattern.likelyHoles.map((row, index) => (
        <p key={index} data-testid="svg-import-holes">
          {t('svgImport.holes', { count: row.count, diameter: mm.format(row.diameterMm) })}
        </p>
      ))}
      {leftOut.length > 0 && (
        <section className="dialog-group" data-testid="svg-import-left-out">
          <div className="dialog-part">{t('svgImport.leftOutTitle')}</div>
          <ul>
            {leftOut.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="dialog-note">{t('svgImport.rolesNote')}</p>
    </>
  );
}
