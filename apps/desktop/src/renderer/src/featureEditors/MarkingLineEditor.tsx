import type { MarkingLine } from '@leathercad/domain';

const PURPOSES: readonly { readonly id: MarkingLine['purpose']; readonly label: string }[] = [
  { id: 'glue-area', label: 'Glue area' },
  { id: 'alignment', label: 'Alignment' },
  { id: 'logo', label: 'Logo' },
  { id: 'skive', label: 'Skive' },
  { id: 'other', label: 'Other' },
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
  return (
    <label className="field">
      <span className="field-label">Purpose</span>
      <select
        data-testid="marking-purpose"
        value={feature.purpose}
        onChange={(event) =>
          onChange({ ...feature, purpose: event.target.value as MarkingLine['purpose'] })
        }
      >
        {PURPOSES.map((purpose) => (
          <option key={purpose.id} value={purpose.id}>
            {purpose.label}
          </option>
        ))}
      </select>
    </label>
  );
}
