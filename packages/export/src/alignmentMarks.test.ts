import { alignmentMarks, evaluate } from '@leathercad/domain';
import { alignmentTick } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { sewnProject } from '../test/scenes.js';
import { exportDxf } from './dxf/writer.js';
import { pageSetupFor } from './paper.js';
import { EXPORT_PRESETS } from './presets.js';
import { PRINT_STYLES, buildExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { exportSvg } from './svg/writer.js';

const marked = sewnProject({ kind: 'ends' });
const marksOf = (partId: string) =>
  alignmentMarks(evaluate(marked)).filter((mark) => mark.partId === partId);
const scene = (project = marked, roles?: Parameters<typeof buildExportScene>[2]) =>
  buildExportScene(evaluate(project), project.name, roles);
const markPaths = (part: { paths: readonly { role: string }[] } | undefined) =>
  part?.paths.filter((item) => item.role === 'mark') ?? [];

describe('alignment marks on paper and in files (9.13)', () => {
  it('print on both pieces of the seam, in the marking role, as the board draws them', () => {
    for (const id of ['panel', 'pocket']) {
      const part = scene().parts.find((p) => p.id === id);
      expect(markPaths(part)).toEqual(
        marksOf(id).map((mark) => ({
          role: 'mark',
          path: alignmentTick(mark),
          style: PRINT_STYLES.mark,
        })),
      );
      expect(markPaths(part)).toHaveLength(2);
    }
  });

  it('add nothing else, and leave a seam without marks printing as it did', () => {
    const plain = scene(sewnProject());
    const withMarks = scene();
    plain.parts.forEach((part, i) => {
      expect(markPaths(part)).toEqual([]);
      expect(withMarks.parts[i]!.paths.filter((item) => item.role !== 'mark')).toEqual(part.paths);
      expect(withMarks.parts[i]!.boundsMm).toEqual(part.boundsMm);
    });
  });

  it('go with the seam when it is unsewn', () => {
    expect(scene({ ...marked, seams: [] }).parts.flatMap(markPaths)).toEqual([]);
  });

  it('follow the layers asked for: none in a laser cut, alone when only marks are wanted', () => {
    expect(scene(marked, EXPORT_PRESETS['laser-cut']).parts.flatMap(markPaths)).toEqual([]);
    const only = scene(marked, ['mark']);
    expect(only.parts.flatMap((part) => part.paths.map((item) => item.role))).toEqual([
      'mark',
      'mark',
      'mark',
      'mark',
    ]);
  });

  it('reach the sheets the PDF and the Sheets view draw', () => {
    const plan = planSheets(scene(), pageSetupFor(marked.settings));
    const placed = plan.sheets.flatMap((sheet) => sheet.placements.map((p) => p.part));
    expect(placed.flatMap(markPaths)).toHaveLength(4);
  });

  it('are written to the SVG’s and the DXF’s marking layer', () => {
    const svg = exportSvg(scene()).text;
    const layer = svg.slice(
      svg.indexOf('<g id="mark"'),
      svg.indexOf('</g>', svg.indexOf('<g id="mark"')),
    );
    expect(layer.match(/<path /g)).toHaveLength(4);

    const dxf = exportDxf(scene()).text.split('\r\n');
    const onMark = dxf.filter((line, i) => line === 'mark' && dxf[i - 1]?.trim() === '8');
    expect(onMark).toHaveLength(4);
  });
});
