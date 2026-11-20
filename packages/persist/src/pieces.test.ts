import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Feature, Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject } from './lcp.js';
import { readFeatures, readPieces, writeFeatures, writePieces } from './pieces.js';

const cardHolder = (): Project =>
  loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/projects/card-holder.lcp')),
  ).project;

describe('readPieces', () => {
  it('reads back what was written: the parts and the seams between them', () => {
    const { parts, seams = [] } = cardHolder();

    expect(readPieces(writePieces({ parts, seams }))).toEqual({ parts, seams });
  });

  it('keeps fields a newer version wrote', () => {
    const [part] = cardHolder().parts;
    const pieces = { parts: [{ ...part!, future: { kept: true } }], seams: [] };

    expect(readPieces(writePieces(pieces)).parts[0]).toHaveProperty('future', { kept: true });
  });

  it('refuses what is not JSON', () => {
    expect(() => readPieces('{"parts": [')).toThrow(InvalidProjectFileError);
  });

  it('refuses a part that is not the shape of one', () => {
    expect(() =>
      readPieces(JSON.stringify({ parts: [{ id: 'p', quantity: 0 }], seams: [] })),
    ).toThrow(InvalidProjectFileError);
  });

  it('refuses a feature following something not in the copy, naming the problem', () => {
    const [outer] = cardHolder().parts;
    // The stitch line and its holes, without the outline they follow.
    const part = { ...outer!, features: outer!.features.slice(1) };

    const refused = (() => {
      try {
        readPieces(writePieces({ parts: [part], seams: [] }));
      } catch (error) {
        return error;
      }
      return null;
    })();

    expect(refused).toBeInstanceOf(InvalidProjectFileError);
    expect((refused as InvalidProjectFileError).problems.map((p) => p.code)).toContain(
      'SOURCE_MISSING',
    );
  });

  it('refuses a seam sewn to holes not in the copy', () => {
    const { parts, seams = [] } = cardHolder();

    expect(() => readPieces(writePieces({ parts: parts.slice(1), seams }))).toThrow(
      InvalidProjectFileError,
    );
  });
});

describe('readFeatures (8.8b-4)', () => {
  /** The card holder's back: everything in it but its outline. */
  const inner = () => cardHolder().parts[0]!.features.slice(1);

  it('reads back what was written: features that follow one another', () => {
    // The back's outline made a cut-out, so what follows it has it to follow.
    const [outline, ...rest] = cardHolder().parts[0]!.features;
    if (outline?.kind !== 'cut-contour') throw new Error('the back starts with its outline');
    const features: Feature[] = [{ ...outline, role: 'inner' }, ...rest];
    expect(readFeatures(writeFeatures({ features, seams: [] }))).toEqual({ features, seams: [] });
  });

  it('refuses a feature following something not in the copy', () => {
    expect(() => readFeatures(writeFeatures({ features: inner(), seams: [] }))).toThrow(
      InvalidProjectFileError,
    );
  });

  it('refuses an outline, which a copy of features never holds', () => {
    const features = cardHolder().parts[0]!.features;
    expect(() => readFeatures(writeFeatures({ features, seams: [] }))).toThrow(/outline/);
  });

  it('refuses what is not JSON', () => {
    expect(() => readFeatures('{"features": [')).toThrow(InvalidProjectFileError);
  });

  it('says a copy that is not one is not the copy, as a fact', () => {
    expect(() => readFeatures('{"features": [')).toThrow(
      expect.objectContaining({ refusal: { kind: 'not-the-copy' } }),
    );
  });
});
