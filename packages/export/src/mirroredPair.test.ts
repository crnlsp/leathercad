import { evaluate, type Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { MIXED_PROJECT } from '../test/scenes.js';
import { exportDxf } from './dxf/writer.js';
import { pageSetupFor } from './paper.js';
import { buildExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { exportSvg } from './svg/writer.js';

/** The mixed project with its first part named and cut `quantity` times, a pair or alike. */
function cut(quantity: number, mirroredPair: boolean): Project {
  return {
    ...MIXED_PROJECT,
    parts: MIXED_PROJECT.parts.map((part, i) =>
      i !== 0
        ? part
        : { ...part, name: 'Side', quantity, ...(mirroredPair ? { mirroredPair: true } : {}) },
    ),
  };
}

const sceneOf = (project: Project) => buildExportScene(evaluate(project), project.name);
const captionOf = (project: Project) => sceneOf(project).parts[0]!.texts[0]!;

/** Everything in a file but its annotation layer, where the captions are. */
function withoutAnnotations(svg: string): string {
  const start = svg.indexOf('<g id="annotation"');
  return start === -1 ? svg : svg.slice(0, start) + svg.slice(svg.indexOf('</g>', start));
}

describe('a mirrored pair’s caption on paper and in files (Q21)', () => {
  it('says to turn the template over for the second of two', () => {
    expect(captionOf(cut(2, true)).source).toBe(
      'Side — cut 2, turn the template over for the second',
    );
  });

  it('says how many to turn over when there are more than two', () => {
    expect(captionOf(cut(4, true)).source).toBe('Side — cut 4, 2 with the template turned over');
    expect(captionOf(cut(6, true)).source).toBe('Side — cut 6, 3 with the template turned over');
  });

  it('leaves a piece cut alike captioned as it was', () => {
    expect(captionOf(cut(2, false)).source).toBe('Side — cut 2');
    expect(captionOf(cut(1, false)).source).toBe('Side');
  });

  it('prints on the sheet the PDF draws, above the piece, at the caption’s size', () => {
    const project = cut(2, true);
    const plan = planSheets(sceneOf(project), pageSetupFor(project.settings));
    const placed = plan.sheets.flatMap((sheet) => sheet.placements.map((p) => p.part));
    const side = placed.find((part) => part.name.startsWith('Side'));
    expect(side?.texts[0]).toMatchObject({
      role: 'annotation',
      source: 'Side — cut 2, turn the template over for the second',
      sizeMm: 2.8,
    });
    expect(side?.texts[0]!.glyphs.length).toBeGreaterThan(captionOf(cut(2, false)).glyphs.length);
  });

  it('changes only the caption in the SVG and the DXF: the piece is cut as drawn', () => {
    const pair = sceneOf(cut(2, true));
    const alike = sceneOf(cut(2, false));
    expect(pair.parts.map((part) => part.paths)).toEqual(alike.parts.map((part) => part.paths));

    const svgPair = exportSvg(pair).text;
    const svgAlike = exportSvg(alike).text;
    expect(svgPair).not.toBe(svgAlike);
    expect(withoutAnnotations(svgPair)).toBe(withoutAnnotations(svgAlike));

    const onLayer = (dxf: string, layer: string) => {
      const lines = dxf.split('\r\n');
      return lines.filter((line, i) => line === layer && lines[i - 1]?.trim() === '8').length;
    };
    const dxfPair = exportDxf(pair).text;
    const dxfAlike = exportDxf(alike).text;
    expect(onLayer(dxfPair, 'annotation')).toBeGreaterThan(onLayer(dxfAlike, 'annotation'));
    expect(onLayer(dxfPair, 'cut')).toBe(onLayer(dxfAlike, 'cut'));
  });
});
