import { LAYER_ROLES, isCutting, type LayerRole } from '@leathercad/domain';

/**
 * Export presets (6.4, docs/printing.md §5): the maker chooses an intent and
 * the intent chooses the layer roles. A preset is a row in this table, so a new
 * intent is a new row and the type follows.
 */

/**
 * The roles a drawing can hold. A construction guide is on screen only (3.10)
 * and no feature has the role, so it is never a layer a maker could choose.
 */
export const EXPORT_ROLES: readonly LayerRole[] = LAYER_ROLES.filter(
  (role) => role !== 'construction',
);

export const EXPORT_PRESETS = {
  /** Everything: the paper pattern, and what the SVG and DXF wrote before presets. */
  'template-print': EXPORT_ROLES,
  /**
   * What a cutter takes off the hide (docs/domain-model.md §5). The stitch holes
   * are the maker's to add — "if lasered" — from the dialog's layers.
   */
  'laser-cut': EXPORT_ROLES.filter(isCutting),
  'stitch-guide': ['stitch', 'stitch-holes'],
} as const satisfies Record<string, readonly LayerRole[]>;

export type ExportIntent = keyof typeof EXPORT_PRESETS;

/** The intents in the order the dialog offers them. */
export const EXPORT_INTENTS = Object.keys(EXPORT_PRESETS) as readonly ExportIntent[];

/**
 * The intent whose roles are exactly these, in any order, or null for a mix of
 * the maker's own — which the dialog calls custom.
 */
export function intentOf(roles: readonly LayerRole[]): ExportIntent | null {
  const wanted = new Set(roles);
  return (
    EXPORT_INTENTS.find((intent) => {
      const preset: readonly LayerRole[] = EXPORT_PRESETS[intent];
      return preset.length === wanted.size && preset.every((role) => wanted.has(role));
    }) ?? null
  );
}
