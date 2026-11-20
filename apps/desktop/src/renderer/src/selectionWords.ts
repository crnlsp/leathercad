import type { Selection } from '@leathercad/document';
import type { Project } from '@leathercad/domain';

import type { I18n, Translate } from '../../shared/i18n.js';
import { selectedCount } from './propertyFacts.js';

/** Several things selected, called what they are: pieces, or features (X9). */
export function manySelectedText(many: ReturnType<typeof selectedCount>, t: Translate): string {
  return many.of === 'pieces'
    ? t('properties.manyPartsSelected', { count: many.count })
    : t('properties.manySelected', { count: many.count });
}

/**
 * What the board's selection is, said politely after it changes (X21): "2
 * pieces selected: Outer, Pocket", or "3 features selected in Outer". Nothing
 * for no selection, and for a guide, which Properties names.
 */
export function selectionAnnouncement(
  project: Project,
  selection: Selection,
  { t, list }: I18n,
): string {
  if (selection.guide !== undefined) return '';
  const pieces = project.parts.filter(
    (part) =>
      selection.parts.has(part.id) || part.features.some((f) => selection.features.has(f.id)),
  );
  if (pieces.length === 0) return '';
  const names = list(
    pieces.map((part) => (part.name.trim() === '' ? t('caption.unnamed') : part.name.trim())),
  );
  const many = selectedCount(project, selection.features, selection.parts);
  return many.of === 'pieces'
    ? t('status.announcePieces', { count: many.count, names })
    : t('status.announceFeatures', { count: many.count, names });
}
