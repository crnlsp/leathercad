import type { MarkingLine } from '@leathercad/domain';

import { useI18n } from '../i18n.js';

const PURPOSES: readonly MarkingLine['purpose'][] = [
  'glue-area',
  'alignment',
  'logo',
  'skive',
  'other',
];

/**
 * What a printed guide is for.
 *
 * The purpose is the whole feature: a marking line is never cut and never
 * stitched, so what it *means* is the only thing distinguishing one from
 * another on the template.
 */
export function MarkingLineEditor({
  feature,
  onChange,
}: {
  feature: MarkingLine;
  onChange: (next: MarkingLine) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="field">
      <span className="field-label">{t('editor.purpose')}</span>
      <select
        data-testid="marking-purpose"
        value={feature.purpose}
        onChange={(event) =>
          onChange({ ...feature, purpose: event.target.value as MarkingLine['purpose'] })
        }
      >
        {PURPOSES.map((purpose) => (
          <option key={purpose} value={purpose}>
            {t(`editor.marking.${purpose}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
