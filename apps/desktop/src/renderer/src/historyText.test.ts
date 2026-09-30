import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { historyText } from './historyText.js';

/**
 * Undo steps in English: the words the document used to compose itself
 * before they became facts (ADR 0018), unchanged.
 */
describe('an undo step, in English', () => {
  const { t } = createI18n('en');

  it('names or counts what a delete took, and what went with it', () => {
    expect(historyText({ action: 'delete', name: 'Stitch holes' }, t)).toBe('Delete Stitch holes');
    expect(historyText({ action: 'delete', count: 3, dependents: 0, frozen: 0 }, t)).toBe(
      'Delete 3 features',
    );
    expect(historyText({ action: 'delete', name: 'Outline', dependents: 2, frozen: 0 }, t)).toBe(
      'Delete Outline and 2 dependents',
    );
    expect(historyText({ action: 'delete', name: 'Outline', dependents: 1, frozen: 0 }, t)).toBe(
      'Delete Outline and 1 dependent',
    );
    expect(historyText({ action: 'delete', name: 'Outline', dependents: 0, frozen: 1 }, t)).toBe(
      'Delete Outline, keep 1 frozen',
    );
    expect(historyText({ action: 'delete', name: 'Panel', dependents: 2, frozen: 1 }, t)).toBe(
      'Delete Panel and 2 dependents, keep 1 frozen',
    );
  });

  it('counts a step over several features, and says one plainly', () => {
    expect(historyText({ action: 'lock', count: 1 }, t)).toBe('Lock');
    expect(historyText({ action: 'lock', count: 2 }, t)).toBe('Lock 2 features');
    expect(historyText({ action: 'hide', count: 1 }, t)).toBe('Hide feature');
    expect(historyText({ action: 'mirror-across-fold', count: 3 }, t)).toBe('Mirror 3 across fold');
  });

  it('names what a step acted on', () => {
    expect(historyText({ action: 'add', name: 'Outline' }, t)).toBe('Add Outline');
    expect(historyText({ action: 'duplicate', name: 'Strap' }, t)).toBe('Duplicate Strap');
    expect(historyText({ action: 'follow', name: 'Outline 2' }, t)).toBe('Follow Outline 2');
    expect(historyText({ action: 'flip-horizontal' }, t)).toBe('Flip horizontal');
  });
});
