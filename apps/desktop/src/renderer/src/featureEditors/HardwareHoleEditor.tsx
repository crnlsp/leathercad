import type { HardwareHole } from '@leathercad/domain';

import { useI18n } from '../i18n.js';

const TYPES: readonly HardwareHole['hardwareType'][] = [
  'rivet',
  'snap',
  'screw',
  'eyelet',
  'other',
];

/**
 * What the hole is for.
 *
 * Centre and diameter are not here on purpose: the hole's geometry is a circle
 * shape, so `CircleEditor` already edits them — and already halves the typed
 * diameter before quantising, which is the rule the tool follows too. This
 * panel adds only what the circle cannot say.
 */
export function HardwareHoleEditor({
  feature,
  onChange,
}: {
  feature: HardwareHole;
  onChange: (next: HardwareHole) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="field">
      <span className="field-label">{t('toolOptions.for')}</span>
      <select
        data-testid="hardware-hole-type"
        value={feature.hardwareType}
        onChange={(event) =>
          onChange({
            ...feature,
            hardwareType: event.target.value as HardwareHole['hardwareType'],
          })
        }
      >
        {TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`hardware.${type}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
