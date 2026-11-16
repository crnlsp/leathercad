import {
  evaluate,
  graphProblems,
  partStructureProblems,
  type Feature,
  type Part,
} from '@leathercad/domain';
import { PathOps, Shapes } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { addPart, emptyDocument, rectShape, rectanglePart } from './commands.js';
import type { FeatureId, PartId } from '@leathercad/domain';
import { importPieces, type DrawnPiece } from './pieces.js';
import { DocumentStore } from './store.js';

let n = 0;
const nextId = () => `id-${String(n++).padStart(4, '0')}`;
const card: DrawnPiece = {
  name: 'card',
  outline: Shapes.rect({ x: 0, y: 0 }, 100, 60),
  cutOuts: [Shapes.rect({ x: 40, y: 20 }, 20, 20)],
  stitchLines: [Shapes.line({ x: 5, y: 5 }, { x: 95, y: 5 })],
  foldLines: [Shapes.line({ x: 50, y: 0 }, { x: 50, y: 60 })],
  markings: [Shapes.line({ x: 10, y: 50 }, { x: 30, y: 50 })],
};
const kinds = (part: Part) =>
  part.features.map((f: Feature) => (f.kind === 'cut-contour' ? f.role : f.kind));

describe('importPieces (9.20b)', () => {
  it('makes each piece a part: its outline, cut-outs, stitching, folds and markings', () => {
    const { command } = importPieces([card], nextId, 1.2);
    const [part] = command.apply(emptyDocument('p')).project.parts;
    expect(part?.name).toBe('card');
    expect(part && kinds(part)).toEqual([
      'outer',
      'inner',
      'stitch-line',
      'fold-line',
      'marking-line',
    ]);
    const fold = part?.features.find((f) => f.kind === 'fold-line');
    expect(fold?.kind === 'fold-line' && fold.materialThicknessMm).toBe(1.2);
  });

  it('is sound by construction: no structure or graph problem, and it evaluates', () => {
    const project = importPieces([card, { ...card, name: 'two' }], nextId).command.apply(
      emptyDocument('p'),
    ).project;
    expect(partStructureProblems(project)).toEqual([]);
    expect(graphProblems(project)).toEqual([]);
    expect(evaluate(project).parts.every((p) => p.features.every((f) => f.ok))).toBe(true);
  });

  it('keeps its true size and, into an empty project, its place', () => {
    const project = importPieces([card], nextId).command.apply(emptyDocument('p')).project;
    const outline = evaluate(project).parts[0]?.features[0];
    expect(outline?.ok && PathOps.bbox(outline.path)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 60,
    });
  });

  it('lands clear of what the open project already holds', () => {
    const before = addPart(
      rectanglePart(
        'old' as PartId,
        'old-cut' as FeatureId,
        'old',
        rectShape({ x: 0, y: 0 }, 80, 50),
      ),
    ).apply(emptyDocument('p'));
    const { command, partIds } = importPieces([card], nextId);
    const after = evaluate(command.apply(before).project);
    const mine = after.parts.find((p) => p.part.id === partIds[0])?.features[0];
    expect(mine?.ok && PathOps.bbox(mine.path)!.minX).toBeGreaterThan(80);
  });

  it('is one undo step, said by count', () => {
    const store = new DocumentStore(emptyDocument('p'));
    const before = store.getState().document;
    const { command } = importPieces([card, card], nextId);
    expect(command.label).toEqual({ action: 'import', count: 2 });
    store.dispatch(command);
    expect(store.getState().document.project.parts).toHaveLength(2);
    store.undo();
    expect(store.getState().document).toBe(before);
  });
});
