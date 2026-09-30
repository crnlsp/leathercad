import type { TextLabel } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';
import { useI18n } from '../i18n.js';

/**
 * The words, and how big they print.
 *
 * Both are the label: a size in millimetres is the number that decides whether
 * it is readable on the sheet, so it is typed rather than dragged — the same
 * reason every other dimension here is typeable.
 */
export function TextLabelEditor({
  feature,
  onText,
  onSize,
}: {
  feature: TextLabel;
  onText: (text: string) => void;
  onSize: (sizeMm: number) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="field">
        <span className="field-label">{t('editor.text')}</span>
        <input
          data-testid="label-text"
          value={feature.source.text}
          onChange={(event) => onText(event.target.value)}
        />
      </label>

      <NumberField
        label={t('editor.size')}
        value={feature.source.sizeMm}
        min={0.5}
        step={0.5}
        onCommit={onSize}
      />
    </>
  );
}
