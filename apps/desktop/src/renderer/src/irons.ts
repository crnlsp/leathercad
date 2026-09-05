/**
 * Pricking irons, by the pitch stamped on them.
 *
 * Application configuration, not document data. The pitch **value** is what
 * gets persisted on a hole set, so a file opens identically on a machine that
 * has never heard of this list; the label rides along only so the panel can
 * name what was chosen.
 *
 * Pitch is nominal — the spacing actually achieved on a given outline is
 * derived and reported separately. See docs/glossary.md.
 */
export interface IronPreset {
  readonly id: string;
  readonly label: string;
  readonly pitchMm: number;
}

export const IRON_PRESETS: readonly IronPreset[] = [
  { id: 'ks-3.85', label: 'KS Blade 3.85 mm', pitchMm: 3.85 },
  { id: 'ks-3.38', label: 'KS Blade 3.38 mm', pitchMm: 3.38 },
  { id: 'ks-3.0', label: 'KS Blade 3.0 mm', pitchMm: 3.0 },
  { id: 'crimson-3.85', label: 'Crimson Hides 3.85 mm', pitchMm: 3.85 },
  { id: 'crimson-3.0', label: 'Crimson Hides 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-3.0', label: 'Amy Roke 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-2.7', label: 'Amy Roke 2.7 mm', pitchMm: 2.7 },
];

/** The preset whose pitch matches, if the pitch came from one of these. */
export function presetForPitch(pitchMm: number, label?: string): IronPreset | undefined {
  return IRON_PRESETS.find((iron) => iron.label === label && iron.pitchMm === pitchMm);
}
