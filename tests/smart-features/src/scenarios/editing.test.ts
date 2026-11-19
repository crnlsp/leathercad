import {
  copyPieces,
  duplicatePart,
  mirrorAxisFor,
  mirrorFeatures,
  pastePieces,
  renameFeature,
  type Command,
} from '@leathercad/document';
import { problemKey, type Diagnostic, type Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import {
  accept,
  at,
  holdsCard,
  holdsSize,
  holesOf,
  movePiece,
  outlineOf,
  resize,
  setInset,
  statesNothing,
  stitchOf,
  unaccept,
} from '../harness/actions.js';
import { checkMatrixClaims } from '../harness/coverage.js';
import { Bench } from '../harness/bench.js';
import type { Expected } from '../harness/expectDiagnostics.js';
import { cardPocket } from './support.js';

/**
 * Editing a project that was checked before (H): every edit, undo, redo, save,
 * reopen, copy and paste leaves exactly the diagnostics of the pattern as it
 * now is — none stale, none twice.
 */

checkMatrixClaims();

const STITCH = stitchOf('pocket');
const narrowOn = (on: string, widthMm = 84): Expected => ({
  code: 'POCKET_TOO_NARROW',
  severity: 'warning',
  on,
  facts: { featureId: on, widthMm, neededMm: 87.6, easeMm: 2 },
});
const narrowPocket = () =>
  new Bench().do(...cardPocket('pocket', { width: 90, height: 60 }), holdsCard(STITCH, 2));

describe('H — editing a project that was checked before', () => {
  it('SF-H1 · saved and opened again, the requirement and the exact diagnostics come back', () => {
    const reopened = narrowPocket().saveAndReopen();
    reopened.expect([narrowOn(STITCH)]);
    const stitch = reopened.project.parts[0]?.features.find((f) => f.id === STITCH);
    expect(stitch).toMatchObject({ holds: { content: { kind: 'id-1' }, easeMm: 2, fully: false } });
  });

  it('SF-H2 · a pasted copy of the pocket carries its requirement: one warning on each, neither twice', () => {
    const bench = narrowPocket();
    const { pieces } = copyPieces(bench.project, ['pocket']);
    bench
      .do(
        pastePieces(
          pieces,
          {
            parts: ['copy'],
            features: [outlineOf('copy'), stitchOf('copy'), holesOf('copy')],
            seams: [],
          },
          at(200, 0),
        ),
      )
      .expect([narrowOn(STITCH), narrowOn(stitchOf('copy'))]);
  });

  it('SF-H3 · a duplicated pocket carries its requirement the same way', () => {
    narrowPocket()
      .do(duplicatePart('pocket', 'twin', [outlineOf('twin'), stitchOf('twin'), holesOf('twin')]))
      .expect([narrowOn(STITCH), narrowOn(stitchOf('twin'))]);
  });

  /**
   * QUESTIONABLE Q-H4 (docs/smart-features.md §7): a mirrored counterpart's
   * stitching takes a copy of the original's requirement when it is made, and
   * keeps it. Its geometry follows the original; its requirement does not, so
   * clearing the original's leaves the counterpart warning. Recorded as it
   * behaves today, until the maintainer decides.
   */
  it('SF-H4 · a mirrored pocket keeps its own copy of the requirement when the original’s is cleared', () => {
    const bench = narrowPocket();
    const ids = [outlineOf('pocket'), STITCH, holesOf('pocket')];
    const mirrored = [outlineOf('mirror'), stitchOf('mirror'), holesOf('mirror')];
    const axis = mirrorAxisFor(bench.project, ids, 'horizontal');
    if (axis === null) throw new Error('a pocket can be mirrored');
    bench
      .do(mirrorFeatures(ids, mirrored, axis, ['mirror']))
      .expect([narrowOn(STITCH), narrowOn(stitchOf('mirror'))], 'mirrored')
      .do(statesNothing(STITCH))
      .expect([narrowOn(stitchOf('mirror'))], 'with the original’s requirement cleared');
  });

  it('SF-H5 · renaming the stitching changes the name the warning carries, not which problem it is', () => {
    const bench = narrowPocket();
    const before = bench.diagnostics[0]!;
    bench.do(renameFeature(STITCH, 'Card slot stitching'));
    const after = bench.diagnostics[0]!;
    expect(after.problem.facts).toMatchObject({ featureName: 'Card slot stitching' });
    expect(problemKey(after.problem)).toBe(problemKey(before.problem));
  });

  /**
   * `problemKey` holds no part of the requirement: a warning about "a card"
   * keeps its key when the maker asks for a passport. So 9.16 does not rely on
   * the key alone — an acceptance stores the requirement and the ease beside
   * it, and SF-H9 holds that the warning returns when they change.
   */
  it('SF-H6 · changing what the pocket holds keeps the same problem key (9.16 does not rely on it alone)', () => {
    const bench = narrowPocket();
    const card = problemKey(bench.diagnostics[0]!.problem);
    bench.do(holdsSize(STITCH, { widthMm: 125, heightMm: 88 }, 0));
    expect(bench.diagnostics.map((d) => problemKey(d.problem))).toEqual([card]);
    expect(bench.diagnostics[0]!.problem.facts).toMatchObject({ content: 'size', neededMm: 125 });
  });

  it('SF-H7 · undo walks back through every state of a session exactly, and redo forward again', () => {
    const steps: (Command | ((p: Project) => Command))[] = [
      holdsCard(STITCH, 2),
      resize('pocket', { width: 100 }),
      holdsCard(STITCH, 2, true),
      resize('pocket', { height: 50 }),
      setInset('pocket', 1),
      holdsCard(STITCH, 9, true),
      statesNothing(STITCH),
    ];
    const bench = new Bench().do(...cardPocket('pocket', { width: 90, height: 60 }));
    const seen: (readonly Diagnostic[])[] = [bench.diagnostics];
    for (const step of steps) seen.push(bench.do(step).diagnostics);
    // The session passes through narrow, clean, too shallow, too near the edge
    // and back: not one state the same as the last.
    expect(new Set(seen.map((d) => JSON.stringify(d))).size).toBeGreaterThan(4);
    for (let i = steps.length - 1; i >= 0; i--) {
      expect(bench.undo().diagnostics, `after undoing step ${i + 1}`).toEqual(seen[i]);
    }
    for (let i = 1; i <= steps.length; i++) {
      expect(bench.redo().diagnostics, `after redoing step ${i}`).toEqual(seen[i]);
    }
  });

  it('SF-H9 · an accepted pocket warning is back when what it holds or its ease changes (9.16)', () => {
    const accepted = { ...narrowOn(STITCH), accepted: true } as const;
    narrowPocket()
      .do(accept('POCKET_TOO_NARROW', STITCH))
      .expect([accepted], 'accepted')
      .do(holdsCard(STITCH, 3))
      .expect(
        [narrowOn(STITCH)].map((e) => ({ ...e, facts: { neededMm: 88.6, easeMm: 3 } })),
        'eased',
      )
      .undo()
      .expect([accepted], 'the ease undone')
      .do(holdsSize(STITCH, { widthMm: 125, heightMm: 88 }, 2))
      .expect(
        [narrowOn(STITCH)].map((e) => ({ ...e, facts: { content: 'size', neededMm: 127 } })),
        'holding a passport',
      )
      .undo()
      .do(unaccept('POCKET_TOO_NARROW', STITCH))
      .expect([narrowOn(STITCH)], 'un-accepted');
  });

  it('SF-H10 · an accepted pocket warning stays accepted through every other edit (9.16)', () => {
    narrowPocket()
      .do(accept('POCKET_TOO_NARROW', STITCH))
      .do(
        resize('pocket', { width: 89, height: 70 }),
        movePiece('pocket', at(30, -20)),
        renameFeature(STITCH, 'Card slot stitching'),
        ...cardPocket('other', { width: 120, height: 80, x: 200 }),
      )
      .expect([{ ...narrowOn(STITCH, 83), accepted: true }]);
  });

  it('SF-H11 · saved and opened again, an accepted warning is still accepted (9.16)', () => {
    narrowPocket()
      .do(accept('POCKET_TOO_NARROW', STITCH))
      .saveAndReopen()
      .expect([{ ...narrowOn(STITCH), accepted: true }]);
  });

  it('SF-H12 · an error cannot be accepted (9.16)', () => {
    // Inset 45 mm into a 60 mm pocket: the stitching collapses, and its holes with it.
    const bench = narrowPocket().do(setInset('pocket', 45));
    const errors: Expected[] = [
      { code: 'OFFSET_COLLAPSED', severity: 'error', on: STITCH },
      { code: 'SOURCE_FAILED', severity: 'error', on: holesOf('pocket') },
    ];
    bench.expect(errors);
    expect(() => bench.do(accept('OFFSET_COLLAPSED', STITCH))).toThrow(/changed nothing/);
    bench.expect(errors);
  });

  it('SF-H8 · editing another piece leaves the pocket’s warning exactly as it was', () => {
    const bench = narrowPocket().do(...cardPocket('other', { width: 120, height: 80, x: 200 }));
    const before = bench.diagnostics;
    bench
      .do(resize('other', { width: 70 }), movePiece('other', at(-50, 90)), setInset('other', 5))
      .expect([narrowOn(STITCH)]);
    expect(bench.diagnostics).toEqual(before);
  });
});
