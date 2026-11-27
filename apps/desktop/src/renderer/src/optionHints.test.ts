import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import { flatten } from '../../shared/i18n.js';
import { fitHints, hintsFor, SHEETS_HINTS, type Hint, type HintSituation } from './optionHints.js';
import { KEYMAP } from './keymap.js';
import { ALL_TOOLS } from './tools.js';

/**
 * The tool's hints (U.11, R-11): two to four per tool and state, each a key and
 * a few words, ranked; as the row narrows the lowest-ranked go first. "? all
 * keys" is the tool row's, apart from them (MS.5).
 */

const catalogue = flatten(en);

/** Every state a tool's hints can differ by. */
const SITUATIONS: readonly HintSituation[] = ALL_TOOLS.flatMap((tool) =>
  [false, true].flatMap((selected) =>
    [false, true].flatMap((underway) =>
      [false, true].map((sizable) => ({ tool: tool.id, selected, sizable, underway })),
    ),
  ),
);

describe('the hints of each tool and state', () => {
  it('are two to four, and none is "all keys", which the tool row keeps', () => {
    for (const hints of [...SITUATIONS.map(hintsFor), SHEETS_HINTS]) {
      expect(hints.length, JSON.stringify(hints)).toBeGreaterThanOrEqual(2);
      expect(hints.length, JSON.stringify(hints)).toBeLessThanOrEqual(4);
      expect(hints.some((hint) => hint.words === 'hints.allKeys')).toBe(false);
    }
  });

  it('rank each hint apart: 1 is kept longest, then 2, and so on', () => {
    for (const hints of [...SITUATIONS.map(hintsFor), SHEETS_HINTS]) {
      const ranks = hints.map((hint) => hint.rank).sort((a, b) => a - b);
      expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    }
  });

  it('use words the catalogue has, and keys the keymap has', () => {
    const commands = new Set<string>(KEYMAP.map((command) => command.id));
    const all = [...SITUATIONS.flatMap(hintsFor), ...SHEETS_HINTS];
    for (const hint of all) {
      expect(catalogue[hint.words], hint.words).toBeTypeOf('string');
      if (typeof hint.key === 'string') expect(commands.has(hint.key), hint.key).toBe(true);
    }
  });

  it('write no key into their words: a key is a cap, read from the keymap', () => {
    const keyWords = /\b(Shift|Ctrl|Del|Delete|Esc|Escape|Enter|Tab|Backspace)\b/;
    for (const hint of new Set(SITUATIONS.flatMap(hintsFor))) {
      expect(catalogue[hint.words], hint.words).not.toMatch(keyWords);
    }
  });

  it('say Esc cancels only while something is under way, and need a selection before offering one', () => {
    const cancels = (hints: readonly Hint[]) => hints.some((hint) => hint.key === 'cancel');
    for (const tool of ['rectangle', 'circle', 'arc', 'line', 'measure'] as const) {
      const idle = { tool, selected: false, sizable: false, underway: false };
      expect(cancels(hintsFor(idle)), tool).toBe(false);
      expect(cancels(hintsFor({ ...idle, underway: true })), tool).toBe(true);
    }
    // A polyline's run has no room for it among the keys only it has (Enter, Backspace, A).
    for (const situation of SITUATIONS.filter(
      (entry) => !entry.underway && entry.tool !== 'select',
    )) {
      expect(cancels(hintsFor(situation)), JSON.stringify(situation)).toBe(false);
    }
    // Enter edits the sizes of a selected outline only.
    const select = { tool: 'select', selected: true, underway: false } as const;
    const enter = (sizable: boolean) =>
      hintsFor({ ...select, sizable }).some((hint) => hint.key === 'editSizes');
    expect(enter(true)).toBe(true);
    expect(enter(false)).toBe(false);
    expect(
      hintsFor({ tool: 'select', selected: false, sizable: true, underway: false }).some(
        (hint) => hint.key === 'editSizes' || hint.key === 'delete',
      ),
    ).toBe(false);
  });

  it('send a tool that needs a selection to Select first, and only while there is none', () => {
    for (const tool of ['rotate', 'scale', 'points', 'hardware', 'text'] as const) {
      const base = { tool, sizable: false, underway: false };
      const picks = (selected: boolean) =>
        hintsFor({ ...base, selected }).some(
          (hint) => hint.key === 'tool.select' && hint.rank === 1,
        );
      expect(picks(false), tool).toBe(true);
      expect(picks(true), tool).toBe(false);
    }
  });
});

describe('which hints fit', () => {
  const sizes = (...entries: readonly (readonly [number, number])[]) =>
    entries.map(([width, rank]) => ({ width, rank }));
  // Display order: A (rank 2), B (rank 1), C (rank 3). All 100 wide, gap 10.
  const row = sizes([100, 2], [100, 1], [100, 3]);

  it('keeps everything when there is room', () => {
    expect(fitHints(row, 320, 10)).toEqual([true, true, true]);
    expect(fitHints(row, 5000, 10)).toEqual([true, true, true]);
  });

  it('drops the lowest-ranked first, wherever it stands', () => {
    expect(fitHints(row, 319, 10)).toEqual([true, true, false]);
    expect(fitHints(row, 209, 10)).toEqual([false, true, false]);
    expect(fitHints(row, 99, 10)).toEqual([false, false, false]);
  });

  it('holds on the widths at each boundary: the edge itself is room enough', () => {
    expect(fitHints(row, 210, 10)).toEqual([true, true, false]);
    expect(fitHints(row, 100, 10)).toEqual([false, true, false]);
  });

  it('does not skip a wide hint to keep a narrower, lower one', () => {
    // B (rank 1) is wide; the narrow C (rank 2) would fit, but a higher rank is
    // never dropped for a lower one.
    expect(fitHints(sizes([300, 1], [20, 2]), 100, 10)).toEqual([false, false]);
  });

  it('keeps every hint whole or drops it: the result has one answer per hint', () => {
    expect(fitHints([], 100, 10)).toEqual([]);
  });

  const widths = fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 6 });

  /** Hints with distinct ranks 1…n in a shuffled order. */
  const rows = widths.chain((list) =>
    fc
      .shuffledSubarray(
        list.map((_, i) => i + 1),
        { minLength: list.length, maxLength: list.length },
      )
      .map((ranks) => list.map((width, i) => ({ width, rank: ranks[i]! }))),
  );

  it('property: more room never drops a hint that fitted in less', () => {
    fc.assert(
      fc.property(
        rows,
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 24 }),
        (list, room, extra, gap) => {
          const narrow = fitHints(list, room, gap);
          const wide = fitHints(list, room + extra, gap);
          narrow.forEach((kept, i) => {
            if (kept) expect(wide[i]).toBe(true);
          });
        },
      ),
    );
  });

  it('property: what is kept is the top of the ranking, and what is dropped is below it', () => {
    fc.assert(
      fc.property(
        rows,
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 0, max: 24 }),
        (list, room, gap) => {
          const kept = fitHints(list, room, gap);
          const lowestKept = Math.max(...list.filter((_, i) => kept[i]).map((hint) => hint.rank));
          const dropped = list.filter((_, i) => !kept[i]).map((hint) => hint.rank);
          for (const rank of dropped) expect(rank).toBeGreaterThan(lowestKept);
        },
      ),
    );
  });

  it('property: whatever is kept fits', () => {
    fc.assert(
      fc.property(
        rows,
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 0, max: 24 }),
        (list, room, gap) => {
          const kept = fitHints(list, room, gap);
          const used = list.filter((_, i) => kept[i]);
          const total = used.reduce((sum, hint) => sum + hint.width, 0) + gap * (used.length - 1);
          if (used.length > 0) expect(total).toBeLessThanOrEqual(room);
        },
      ),
    );
  });
});
