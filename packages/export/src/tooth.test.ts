import { evaluate, type Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { sewnProject, toothedProject } from '../test/scenes.js';
import { exportDxf } from './dxf/writer.js';
import { pageSetupFor } from './paper.js';
import { exportPdf } from './pdf/writer.js';
import { STITCH_HOLE_MARKER_DIAMETER_MM, buildExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { exportSvg } from './svg/writer.js';

type Point = readonly [number, number];

const holesOnly = (project: Project) =>
  buildExportScene(evaluate(project), project.name, ['stitch-holes'], 'outlines');

const holeCount = (project: Project, partId: string): number =>
  evaluate(project)
    .parts.find((part) => part.part.id === partId)!
    .features.reduce((sum, entry) => sum + (entry.ok ? (entry.holes?.count ?? 0) : 0), 0);

/** Every point a path in the SVG's stitch-holes layer passes through, path by path. */
function svgHoles(svg: string): Point[][] {
  const layer = svg.slice(svg.indexOf('<g id="stitch-holes"'), svg.indexOf('</g>'));
  return [...layer.matchAll(/ d="([^"]+)"/g)].map(([, d]) => {
    const numbers = (d!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const points: Point[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!]);
    return points;
  });
}

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const widest = (points: readonly Point[]): number =>
  Math.max(...points.flatMap((a) => points.map((b) => distance(a, b))));

describe('a hole set’s tooth in a file for a cutter (9.26, D27)', () => {
  it('writes each slit’s true outline to the SVG: a lozenge as long as the tooth', () => {
    const project = toothedProject();
    const svg = exportSvg(holesOnly({ ...project, parts: [project.parts[0]!] })).text;
    const holes = svgHoles(svg);

    expect(holes).toHaveLength(holeCount(project, 'panel'));
    for (const hole of holes) {
      // Four corners and the return to the first, at 4 decimals in the file.
      expect(hole).toHaveLength(5);
      expect(widest(hole)).toBeCloseTo(2.387, 3);
    }
  });

  it('writes each round hole at its diameter to the SVG, measured in the file', () => {
    const project = toothedProject();
    const svg = exportSvg(holesOnly({ ...project, parts: [project.parts[1]!] })).text;
    const radii = [...svg.matchAll(/<circle [^>]* r="([\d.]+)"/g)].map(([, r]) => r);

    expect(radii).toHaveLength(holeCount(project, 'pocket'));
    expect(new Set(radii)).toEqual(new Set(['0.6']));
  });

  it('writes the same outlines to the DXF, as lines in the stitch-holes layer', () => {
    const project = toothedProject();
    const dxf = exportDxf(holesOnly({ ...project, parts: [project.parts[0]!] })).text.split('\r\n');
    const lines: [Point, Point][] = [];
    for (let i = 0; i < dxf.length; i++) {
      if (dxf[i] !== 'LINE' || dxf[i + 2] !== 'stitch-holes') continue;
      const at = (code: string) => Number(dxf[dxf.indexOf(code, i) + 1]);
      lines.push([
        [at(' 10'), at(' 20')],
        [at(' 11'), at(' 21')],
      ]);
    }
    // Four sides a hole, each the side of a 2.387 × 0.4 lozenge.
    expect(lines).toHaveLength(4 * holeCount(project, 'panel'));
    const side = Math.hypot(2.387 / 2, 0.4 / 2);
    for (const [a, b] of lines) expect(distance(a, b)).toBeCloseTo(side, 3);
  });

  it('writes a hole set whose iron was not said exactly as before: centre marks (D26)', () => {
    const plain = sewnProject();
    const centres = buildExportScene(evaluate(plain), plain.name, ['stitch-holes'], 'centres');
    expect(holesOnly(plain)).toEqual(centres);
    for (const item of centres.parts.flatMap((part) => part.paths)) {
      const [mark] = item.path.segments;
      expect(mark?.kind === 'arc' && mark.radius).toBe(STITCH_HOLE_MARKER_DIAMETER_MM / 2);
    }
  });
});

describe('a hole set’s tooth on paper (9.26, D27)', () => {
  const pdfOf = async (project: Project) => {
    const scene = buildExportScene(evaluate(project), project.name);
    const { bytes } = await exportPdf(planSheets(scene, pageSetupFor(project.settings)), {
      now: () => new Date('2026-11-17T00:00:00.000Z'),
      applicationVersion: 'test',
    });
    return bytes;
  };

  it('prints the PDF byte for byte as it did before the iron was said: centre marks', async () => {
    expect(await pdfOf(toothedProject())).toEqual(await pdfOf(sewnProject()));
  });
});
