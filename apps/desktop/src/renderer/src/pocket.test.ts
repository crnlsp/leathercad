import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluate, pocketSize } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { EPS_LENGTH } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

describe('shipping pocket dimensions', () => {
  it.each([
    ['card-holder', 99, 41.3487],
    ['bifold-wallet', 89, 53],
  ])('%s measures its stitching rather than its cut opening', (name, width, depth) => {
    const file = resolve(import.meta.dirname, '../../../../../fixtures/projects', name + '.lcp');
    const project = loadProject(readFileSync(file)).project;
    const pocket = evaluate(project).parts.find((part) => part.part.id === 'pocket');
    const stitch = pocket?.features.find((entry) => entry.feature.kind === 'stitch-line');
    if (stitch?.ok !== true) throw new Error('shipping pocket stitching must resolve');
    const size = pocketSize(stitch.path);
    expect(size).not.toBeNull();
    expect(Math.abs((size?.widthMm ?? Infinity) - width)).toBeLessThanOrEqual(EPS_LENGTH);
    expect(Math.abs((size?.depthMm ?? Infinity) - depth)).toBeLessThanOrEqual(EPS_LENGTH);
  });
});
