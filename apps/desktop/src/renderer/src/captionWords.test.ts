import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluate, type Feature, type Part, type ResolvedPart } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { captionOf } from './captionWords.js';

/**
 * A piece's caption on the board, in the interface's words (R-01, ADR 0018).
 * Paper keeps its own: "Card pocket — cut 2".
 */

const english = createI18n('en');

/** The sample wallet, as Help opens it, evaluated — its part named `name`. */
function samplePart(name: string): ResolvedPart {
  const file = resolve(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp');
  const { project } = loadProject(new Uint8Array(readFileSync(file)));
  const part = evaluate(project).parts.find((entry) => entry.part.name === name);
  if (part === undefined) throw new Error(`The sample has no part named ${name}.`);
  return part;
}

const bare = (part: Partial<Part>): ResolvedPart => ({
  part: { id: 'part', name: 'Panel', quantity: 1, features: [], ...part },
  features: [],
});

describe('captionOf', () => {
  it('reads "Card pocket ×2" over "52 holes · 3.85 mm"', () => {
    expect(captionOf(english, samplePart('Card pocket'))).toEqual({
      name: 'Card pocket ×2',
      detail: '52 holes · 3.85 mm',
    });
  });

  it('says no ×1 for a piece cut once', () => {
    expect(captionOf(english, samplePart('Outer'))).toEqual({
      name: 'Outer',
      detail: '146 holes · 3.85 mm',
    });
  });

  it('says nothing under a piece without stitching', () => {
    expect(captionOf(english, bare({}))).toEqual({ name: 'Panel', detail: null });
  });

  it('names a piece whose name was cleared', () => {
    expect(captionOf(english, bare({ name: '  ', quantity: 3 })).name).toBe('Part ×3');
  });

  it('counts one hole as one hole, and lists each pitch', () => {
    const outer = samplePart('Outer');
    const holes = outer.features.find((entry) => entry.feature.kind === 'stitch-hole-set');
    if (holes?.ok !== true || holes.holes === undefined) throw new Error('The sample has holes.');
    const { source } = holes.feature;
    if (source.kind !== 'derived' || source.op.type !== 'stitch-holes') throw new Error('Derived.');
    const one = { ...holes, holes: { ...holes.holes, count: 1 } };
    const atThree = {
      ...one,
      feature: {
        ...one.feature,
        source: { ...source, op: { ...source.op, pitchMm: 3 } },
      } as Feature,
    };

    expect(captionOf(english, { ...outer, features: [one] }).detail).toBe('1 hole · 3.85 mm');
    expect(captionOf(english, { ...outer, features: [one, atThree] }).detail).toBe(
      '1 hole · 3.85 mm, 1 hole · 3.00 mm',
    );
  });
});
