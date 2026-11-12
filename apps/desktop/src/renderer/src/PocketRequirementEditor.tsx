import { EPS_LENGTH } from '@leathercad/core';
import { setPocketRequirement, type DocumentStore } from '@leathercad/document';
import { ID1_CARD, contentSize, type PocketRequirement, type StitchLine } from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';
import { useMemo } from 'react';

import { useI18n } from './i18n.js';
import { NumberField } from './NumberField.js';
import { choiceOf, standsProud, withChoice, type HoldsChoice } from './pocketRequirement.js';

/**
 * What the maker says a pocket holds (9.14b), under its reading in
 * Properties. Each change is one command; the rule's verdict is listed with
 * the stitch line's problems, so nothing here judges.
 */
export function PocketRequirementEditor({
  store,
  feature,
  path,
  outline,
  makerEaseMm,
}: {
  store: DocumentStore;
  feature: StitchLine;
  path: Path;
  /** The part's evaluated outline, where the opening is read from. */
  outline: Path | null;
  /** Settings › My tools: what a first requirement's ease starts at. */
  makerEaseMm: number | null;
}) {
  const { t, locale } = useI18n();
  const holds = feature.holds;
  const set = (next: PocketRequirement | undefined) =>
    store.dispatch(setPocketRequirement(feature.id, next));
  const proud = useMemo(
    () => (holds === undefined ? null : standsProud(path, outline, holds)),
    [path, outline, holds],
  );
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  return (
    <fieldset
      className="field-group pocket-requirement"
      disabled={feature.locked}
      data-testid="pocket-requirement"
    >
      <label className="field">
        <span className="field-label">{t('pocket.holds.label')}</span>
        <select
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
      </label>
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
          {proud !== null && (
            <p className="panel-note" data-testid="pocket-proud">
              {proud > EPS_LENGTH
                ? t('pocket.holds.proud', { value: number.format(proud) })
                : t('pocket.holds.below', { value: number.format(-proud) })}
            </p>
          )}
          <p className="panel-note">{t('pocket.holds.note')}</p>
        </>
      )}
    </fieldset>
  );
}
