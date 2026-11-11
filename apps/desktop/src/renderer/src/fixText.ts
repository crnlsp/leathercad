import { formatMm } from '@leathercad/core';
import type { Fix } from '@leathercad/document';

import type { Translate } from '../../shared/i18n.js';

/** What a fix does, in the interface's words: the button's face (9.17). */
export function fixText(fix: Fix, t: Translate): string {
  switch (fix.kind) {
    case 'seam-length':
      return t(fix.changeMm < 0 ? 'fixes.shorten' : 'fixes.lengthen', {
        name: fix.featureName,
        length: formatMm(Math.abs(fix.changeMm), 2),
      });
    case 'edge-margin':
      return t('fixes.margin', { name: fix.featureName, margin: formatMm(fix.marginMm, 2) });
  }
}
