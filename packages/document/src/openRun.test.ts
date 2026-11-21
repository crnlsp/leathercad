import { diagnose, type Derivation, type Project } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  rectShape,
  setDerivation,
  shapePart,
} from './commands.js';
import { DocumentStore } from './store.js';

// U2: a pocket stitched on three sides — *Open at the top* — must not start
// with its end holes on the open edge.

type Offset = Extract<Derivation, { type: 'offset' }>;
type Holes = Extract<Derivation, { type: 'stitch-holes' }>;

function opOf<T extends Derivation>(project: Project, id: string): T {
  const feature = project.parts.flatMap((p) => p.features).find((f) => f.id === id);
  if (feature?.source.kind !== 'derived') throw new Error(`${id} is not derived`);
  return feature.source.op as T;
}

interface Piece {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly rotation: number;
  readonly insetMm: number;
}

function stitchedPiece(piece: Piece, holesFirst: boolean, side: number): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  const shape = rectShape(
    { x: 10, y: 10 },
    piece.width,
    piece.height,
    piece.radius,
    piece.rotation,
  );
  store.dispatch(addPart(shapePart('part-1', 'cut-1', 'Pocket', shape)));
  store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', piece.insetMm));
  const open = (): void => {
    const op = opOf<Offset>(store.getState().document.project, 'stitch-1');
    store.dispatch(
      setDerivation('stitch-1', {
        ...op,
        run: { kind: 'between', fromAnchor: (side + 1) % 4, toAnchor: side },
      }),
    );
  };
  const holes = (): void => {
    store.dispatch(addStitchHoles('part-1', 'holes-1', 'stitch-1'));
  };
  if (holesFirst) {
    holes();
    open();
  } else {
    open();
    holes();
  }
  return store;
}

const atTheEdge = (project: Project) =>
  diagnose(project)
    .map((d) => d.problem.code)
    .filter((code) => code === 'OUTSIDE_PART' || code === 'HOLE_TOO_CLOSE_TO_EDGE');

const piece = fc
  .record({
    width: fc.double({ min: 30, max: 200, noNaN: true }),
    height: fc.double({ min: 30, max: 200, noNaN: true }),
    roundness: fc.double({ min: 0, max: 0.4, noNaN: true }),
    quarters: fc.integer({ min: 0, max: 3 }),
    insetMm: fc.double({ min: 2, max: 6, noNaN: true }),
  })
  .map(({ width, height, roundness, quarters, insetMm }): Piece => ({
    width,
    height,
    radius: roundness * Math.min(width, height),
    rotation: (quarters * Math.PI) / 2,
    insetMm,
  }));

describe('opening a stitch run (U2)', () => {
  it('starts the end holes clear of the open edge, whichever came first', () => {
    fc.assert(
      fc.property(piece, fc.boolean(), fc.integer({ min: 0, max: 3 }), (p, holesFirst, side) => {
        const store = stitchedPiece(p, holesFirst, side);
        expect(atTheEdge(store.getState().document.project)).toEqual([]);
      }),
    );
  });

  it('sets both offsets to the line’s inset, as one undo step with the run', () => {
    const p = { width: 95, height: 70, radius: 0, rotation: 0, insetMm: 3.5 };
    const store = stitchedPiece(p, true, 1);
    const holes = opOf<Holes>(store.getState().document.project, 'holes-1');
    expect(holes).toMatchObject({ startOffsetMm: 3.5, endOffsetMm: 3.5 });

    store.undo();
    const project = store.getState().document.project;
    expect(opOf<Offset>(project, 'stitch-1').run).toEqual({ kind: 'whole' });
    expect(opOf<Holes>(project, 'holes-1').startOffsetMm).toBeUndefined();
  });

  it('keeps offsets the maker already chose', () => {
    const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
    store.dispatch(
      addPart(shapePart('part-1', 'cut-1', 'Pocket', rectShape({ x: 0, y: 0 }, 95, 70))),
    );
    store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 3.5));
    store.dispatch(addStitchHoles('part-1', 'holes-1', 'stitch-1', { startOffsetMm: 6 }));
    const op = opOf<Offset>(store.getState().document.project, 'stitch-1');
    store.dispatch(
      setDerivation('stitch-1', { ...op, run: { kind: 'between', fromAnchor: 2, toAnchor: 1 } }),
    );
    const holes = opOf<Holes>(store.getState().document.project, 'holes-1');
    expect(holes.startOffsetMm).toBe(6);
    expect(holes.endOffsetMm).toBeUndefined();
  });

  it('leaves a run that was already open alone when another side is chosen', () => {
    const store = stitchedPiece(
      { width: 95, height: 70, radius: 0, rotation: 0, insetMm: 3.5 },
      true,
      1,
    );
    const op = opOf<Holes>(store.getState().document.project, 'holes-1');
    store.dispatch(setDerivation('holes-1', { ...op, startOffsetMm: 1, endOffsetMm: 2 }));
    const line = opOf<Offset>(store.getState().document.project, 'stitch-1');
    store.dispatch(
      setDerivation('stitch-1', { ...line, run: { kind: 'between', fromAnchor: 3, toAnchor: 2 } }),
    );
    expect(opOf<Holes>(store.getState().document.project, 'holes-1')).toMatchObject({
      startOffsetMm: 1,
      endOffsetMm: 2,
    });
  });
});
