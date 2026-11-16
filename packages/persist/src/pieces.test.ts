import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject } from './lcp.js';
import { readPieces, writePieces } from './pieces.js';

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
