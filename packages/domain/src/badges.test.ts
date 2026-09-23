import { describe, expect, it } from 'vitest';

import { badgesOf, worstOf } from './badges.js';
import type { Diagnostic, Severity } from './problems/index.js';

/** A diagnostic reduced to what a badge reads: where it is, and how bad. */
const at = (severity: Severity, partId: string, featureId?: string): Diagnostic =>
  ({
    problem: { code: 'EMPTY_PART', facts: { partId, partName: 'x' } },
    severity,
    partId,
    related: [],
    ...(featureId === undefined ? {} : { featureId }),
  }) as unknown as Diagnostic;

describe('worstOf', () => {
  it('ranks an error above a warning above an info', () => {
    expect(worstOf(['info', 'warning'])).toBe('warning');
    expect(worstOf(['warning', 'error', 'info'])).toBe('error');
    expect(worstOf(['info', 'info', 'info'])).toBe('info');
  });

  it('has no answer for nothing', () => {
    expect(worstOf([])).toBeNull();
  });

  it('does not take the commonest', () => {
    // Nine infos and one error is an error. A part with a real problem must
    // never look like a part with a handful of remarks.
    expect(worstOf([...Array<Severity>(9).fill('info'), 'error'])).toBe('error');
  });
});

describe('badgesOf', () => {
  it('shows nothing when there is nothing wrong', () => {
    const badges = badgesOf([]);

    expect(badges.project).toBeNull();
    expect(badges.parts.size).toBe(0);
    expect(badges.features.size).toBe(0);
  });

  it('counts a feature badge from the diagnostics naming that feature', () => {
    const badges = badgesOf([at('warning', 'p1', 'f1'), at('info', 'p1', 'f1')]);

    expect(badges.features.get('f1')).toEqual({ count: 2, worst: 'warning' });
  });

  it('rolls a part badge up from its features and its own problems', () => {
    // A part's badge answers "is there anything wrong in here", which includes
    // everything inside it — otherwise a collapsed part hides its own trouble.
    const badges = badgesOf([at('info', 'p1'), at('error', 'p1', 'f1'), at('warning', 'p1', 'f2')]);

    expect(badges.parts.get('p1')).toEqual({ count: 3, worst: 'error' });
    expect(badges.features.get('f1')).toEqual({ count: 1, worst: 'error' });
    expect(badges.features.get('f2')).toEqual({ count: 1, worst: 'warning' });
  });

  it('keeps parts apart', () => {
    const badges = badgesOf([at('error', 'p1', 'f1'), at('info', 'p2', 'f2')]);

    expect(badges.parts.get('p1')).toEqual({ count: 1, worst: 'error' });
    expect(badges.parts.get('p2')).toEqual({ count: 1, worst: 'info' });
  });

  it('counts the whole project in the header badge', () => {
    const badges = badgesOf([at('error', 'p1', 'f1'), at('info', 'p2', 'f2')]);

    expect(badges.project).toEqual({ count: 2, worst: 'error' });
  });

  it('gives no badge to a part with nothing wrong', () => {
    // Absent, not zero: an empty badge is chrome that teaches nothing.
    const badges = badgesOf([at('info', 'p2', 'f2')]);

    expect(badges.parts.has('p1')).toBe(false);
  });
});
