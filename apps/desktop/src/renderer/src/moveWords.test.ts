import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { announceMove, clearanceWords, deltaWords } from './moveWords.js';

/** A move's words (3.17): the readout beside the pointer, and what the live region says. */

const english = createI18n('en');

describe('a move in words', () => {
  it('reads how far it went, to the tenth', () => {
    const readout = { deltaMm: { x: 12, y: -3.04 }, rays: [], clearance: null };
    expect(deltaWords(readout, english.t)).toBe('Δx 12.0 mm · Δy −3.0 mm');
  });

  it("names the rule where the clearance is the rule's warning", () => {
    expect(clearanceWords({ verdict: 'too-close', clearanceMm: 1.4 }, english.t)).toBe(
      '1.40 mm from the edge · Too near the edge',
    );
    expect(clearanceWords({ verdict: 'clear', clearanceMm: 3.5 }, english.t)).toBe(
      '3.50 mm from the edge',
    );
    expect(clearanceWords({ verdict: 'off', clearanceMm: Infinity }, english.t)).toBe(
      'Off the material',
    );
  });

  it('says a kept move by its directions, and the clearance it left', () => {
    expect(
      announceMove(
        { deltaMm: { x: 12, y: -3 }, rays: [], clearance: { verdict: 'clear', clearanceMm: 3.5 } },
        english,
      ),
    ).toBe('Moved 12.0 mm right and 3.0 mm down; 3.50 mm from the edge.');
    expect(announceMove({ deltaMm: { x: 0, y: 0.1 }, rays: [], clearance: null }, english)).toBe(
      'Moved 0.1 mm up.',
    );
  });

  it('says a move dragged back to where it began put nothing anywhere new', () => {
    expect(announceMove({ deltaMm: { x: 0, y: 0 }, rays: [], clearance: null }, english)).toBe(
      'Put back where it was.',
    );
  });
});
