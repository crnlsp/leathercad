import type { Translate } from '../../shared/i18n.js';

import type { selectedCount } from './propertyFacts.js';

/** Several things selected, called what they are: pieces, or features (X9). */
export function manySelectedText(many: ReturnType<typeof selectedCount>, t: Translate): string {
  return many.of === 'pieces'
    ? t('properties.manyPartsSelected', { count: many.count })
    : t('properties.manySelected', { count: many.count });
}
