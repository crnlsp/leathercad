import { describe, expect, it } from 'vitest';

import { featureTree, type FeatureNode } from './featureTree.js';
import type { Feature, Part } from './feature.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const outline = (id = 'cut-1'): Feature => ({
  ...base(id, 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: { type: 'circle', centre: { x: 50, y: 50 }, radius: 30 },
  },
});

const stitchLine = (id: string, from: string): Feature => ({
  ...base(id, 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
  },
});

const holes = (id: string, from: string): Feature => ({
  ...base(id, 'Stitch holes'),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
});

const mark = (id: string): Feature => ({
  ...base(id, 'Glue line'),
  kind: 'marking-line',
  purpose: 'glue-area',
  source: {
    kind: 'path',
    path: {
      segments: [{ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }],
      closed: false,
    },
  },
});

const part = (...features: Feature[]): Part => ({
  id: 'part-1',
  name: 'Panel',
  quantity: 1,
  features,
});

/** Ids in the shape the panel draws them, so a test reads like the tree. */
const shapeOf = (nodes: readonly FeatureNode[]): unknown =>
  nodes.map((node) =>
    node.children.length === 0 ? node.feature.id : { [node.feature.id]: shapeOf(node.children) },
  );

describe('featureTree', () => {
  it('nests a derived chain under what it follows', () => {
    // Outline ▸ Stitch line ▸ Holes — the shape §3.1 asks the panel to show,
    // and the reason the delete dialog is not a surprise.
    const tree = featureTree(
      part(outline(), stitchLine('stitch-1', 'cut-1'), holes('h-1', 'stitch-1')),
    );

    expect(shapeOf(tree)).toEqual([{ 'cut-1': [{ 'stitch-1': ['h-1'] }] }]);
  });

  it('keeps drawn features at the top, in document order', () => {
    const tree = featureTree(part(outline(), mark('m-1'), mark('m-2')));

    expect(shapeOf(tree)).toEqual(['cut-1', 'm-1', 'm-2']);
  });

  it('puts two followers of one source side by side', () => {
    const tree = featureTree(
      part(outline(), stitchLine('stitch-1', 'cut-1'), stitchLine('stitch-2', 'cut-1')),
    );

    expect(shapeOf(tree)).toEqual([{ 'cut-1': ['stitch-1', 'stitch-2'] }]);
  });

  it('leaves a follower of another part at the top of its own', () => {
    // Its source is not in this part, so there is nothing here to nest it
    // under. Hiding it would be worse: it would simply not appear.
    const tree = featureTree(part(outline(), stitchLine('stitch-1', 'elsewhere')));

    expect(shapeOf(tree)).toEqual(['cut-1', 'stitch-1']);
  });

  it('holds every feature exactly once', () => {
    const features = [
      outline(),
      stitchLine('stitch-1', 'cut-1'),
      holes('h-1', 'stitch-1'),
      mark('m-1'),
    ];
    const seen: string[] = [];
    const walk = (nodes: readonly FeatureNode[]): void => {
      for (const node of nodes) {
        seen.push(node.feature.id);
        walk(node.children);
      }
    };

    walk(featureTree(part(...features)));

    expect(seen.sort()).toEqual(features.map((f) => f.id).sort());
  });

  it('terminates on a cycle, which S3 makes unreachable', () => {
    // A panel that hangs is worse than one that lies. S3 refuses this at the
    // command and at the loader, so reaching it means a file arrived from
    // somewhere else entirely — it must still draw something.
    const a = stitchLine('a', 'b');
    const b = stitchLine('b', 'a');

    // Neither can nest under the other without nesting forever, so both are
    // roots and the panel shows them flat.
    expect(shapeOf(featureTree(part(a, b)))).toEqual(['a', 'b']);
  });

  it('has nothing to say about an empty part', () => {
    expect(featureTree(part())).toEqual([]);
  });
});
