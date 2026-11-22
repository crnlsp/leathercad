import { setPocketRequirement, type DocumentStore } from '@leathercad/document';
import {
  ID1_CARD,
  contentSize,
  pocketOpening,
  pocketSize,
  type PocketRequirement,
  type StitchLine,
} from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';
import { useId, useMemo } from 'react';

import { useI18n } from './i18n.js';
import { NumberField } from './NumberField.js';
import { HelpTip } from './Tooltip.js';
import { acrossVerdict, choiceOf, withChoice, type HoldsChoice } from './pocketRequirement.js';

/**
 * What the maker says a pocket holds (9.14b), under its reading in
 * Properties. Each change is one command. The width line gives the verdict
 * DR8 makes, fits or too narrow, with what it measured (U7); the depth line
 * says what was measured, and to which piece's edge (Q49, smart-features §5).
 */
export function PocketRequirementEditor({
  store,
  feature,
  piece,
  path,
  outline,
  makerEaseMm,
}: {
  store: DocumentStore;
  feature: StitchLine;
  /** The name of the piece the stitching is on, whose edge the opening is read from. */
  piece: string;
  /** Null while the stitch line fails to build: the requirement waits, unchecked (L3). */
  path: Path | null;
  /** The part's evaluated outline, where the opening is read from. */
  outline: Path | null;
  /** Settings › My tools: what a first requirement's ease starts at. */
  makerEaseMm: number | null;
}) {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const holds = feature.holds;
  const holdsId = useId();
  const set = (next: PocketRequirement | undefined) =>
    store.dispatch(setPocketRequirement(feature.id, next));
  const size = useMemo(() => (path === null ? null : pocketSize(path)), [path]);
  const opening = useMemo(
    () => (path === null || outline === null ? null : pocketOpening(path, outline)),
    [path, outline],
  );
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  return (
    <fieldset
      className="field-group pocket-requirement"
      disabled={feature.locked}
      data-testid="pocket-requirement"
    >
      {/* A div, not a label: the (?) inside would join the select's name. */}
      <div className="field">
        <span className="field-label">
          <label htmlFor={holdsId}>{t('pocket.holds.label')}</label>
          {holds?.content.kind === 'size' && <HelpTip text={t('pocket.holds.note')} />}
        </span>
        <select
          id={holdsId}
          data-testid="pocket-holds"
          value={choiceOf(holds)}
          onChange={(event) =>
            set(withChoice(event.target.value as HoldsChoice, holds, makerEaseMm))
          }
        >
          <option value="none">{t('pocket.holds.none')}</option>
          <option value="id-1">
            {t('pocket.holds.id-1', {
              width: number.format(ID1_CARD.widthMm),
              height: number.format(ID1_CARD.heightMm),
            })}
          </option>
          <option value="size">{t('pocket.holds.size')}</option>
        </select>
      </div>
      {holds === undefined && size !== null && (
        <p className="panel-note" data-testid="pocket-invite">
          {t('pocket.holds.invite')}
        </p>
      )}
      {holds?.content.kind === 'size' && (
        <>
          <NumberField
            label={t('pocket.holds.width')}
            value={holds.content.widthMm}
            min={0.1}
            step={0.5}
            onCommit={(widthMm) =>
              set({
                ...holds,
                content: { kind: 'size', widthMm, heightMm: contentSize(holds.content).heightMm },
              })
            }
          />
          <NumberField
            label={t('pocket.holds.height')}
            value={holds.content.heightMm}
            min={0.1}
            step={0.5}
            onCommit={(heightMm) =>
              set({
                ...holds,
                content: { kind: 'size', widthMm: contentSize(holds.content).widthMm, heightMm },
              })
            }
          />
        </>
      )}
      {holds !== undefined && (
        <>
          <NumberField
            label={t('pocket.holds.ease')}
            value={holds.easeMm}
            min={0}
            step={0.5}
            onCommit={(easeMm) => set({ ...holds, easeMm })}
          />
          <label className="field">
            <span className="field-label">{t('pocket.holds.fully')}</span>
            <input
              type="checkbox"
              data-testid="pocket-fully"
              checked={holds.fully}
              onChange={(event) => set({ ...holds, fully: event.target.checked })}
            />
          </label>
          {path === null && (
            <p className="panel-note" data-testid="pocket-unbuilt">
              {t('pocket.holds.unbuilt')}
            </p>
          )}
          {size !== null && (
            <p className="panel-note" data-testid="pocket-across">
              {acrossVerdict(size.widthMm, holds, i18n)}
            </p>
          )}
          {opening !== null && (
            <p className="panel-note" data-testid="pocket-down">
              {t('pocket.holds.down', {
                depth: number.format(opening.depthMm),
                piece,
                rise: number.format(opening.riseMm),
                content: number.format(contentSize(holds.content).heightMm),
              })}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
