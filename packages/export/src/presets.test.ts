import {
  DEFAULT_SETTINGS,
  LAYER_ROLES,
  evaluate,
  isCutting,
  type Feature,
  type LayerRole,
  type Project,
} from '@leathercad/domain';
import { PathOps, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { exportDxf } from './dxf/writer.js';
import { drawingBoundsOf } from './fileScene.js';
import { EXPORT_INTENTS, EXPORT_PRESETS, EXPORT_ROLES, intentOf } from './presets.js';
import { buildExportScene, type ExportScene } from './scene.js';
import { exportSvg } from './svg/writer.js';

/**
 * Export presets (6.4): the maker names an intent, the intent names the layer
 * roles, and `buildExportScene` is the one place that filters — so the PDF,
 * the SVG and the DXF cannot disagree about what a preset holds.
 */

const base = (id: string) => ({ id, name: id, visible: true, locked: false });

const line = (from: [number, number], to: [number, number]) =>
  PathOps.polyline(
    [
      { x: from[0], y: from[1] },
      { x: to[0], y: to[1] },
    ],
    false,
  );

/** One part with a feature of every role, and a second part of only a fold. */
const EVERY_ROLE: Project = {
  id: 'p',
  name: 'Every role',
  settings: DEFAULT_SETTINGS,
  parts: [
    {
      id: 'panel',
      name: 'Panel',
      quantity: 1,
      features: [
        {
          ...base('outline'),
          kind: 'cut-contour',
          role: 'outer',
          source: {
            kind: 'shape',
            shape: {
              type: 'rect',
              origin: { x: 0, y: 0 },
              width: 100,
              height: 70,
              radii: uniformRadii(0),
              rotation: 0,
            },
          },
        },
        {
          ...base('seam'),
          kind: 'stitch-line',
          source: {
            kind: 'derived',
            sourceId: 'outline',
            op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
          },
        },
        {
          ...base('holes'),
          kind: 'stitch-hole-set',
          source: {
            kind: 'derived',
            sourceId: 'seam',
            op: {
              type: 'stitch-holes',
              pitchMm: 3.85,
              mode: 'fit-whole',
              corners: 'hole-at-corner',
            },
          },
        },
        {
          ...base('fold'),
          kind: 'fold-line',
          direction: 'mountain',
          source: { kind: 'path', path: line([50, 0], [50, 70]) },
        },
        {
          ...base('glue'),
          kind: 'marking-line',
          purpose: 'glue-area',
          source: { kind: 'path', path: line([10, 10], [40, 10]) },
        },
        {
          ...base('rivet'),
          kind: 'hardware-hole',
          hardwareType: 'rivet',
          source: { kind: 'shape', shape: { type: 'circle', centre: { x: 70, y: 35 }, radius: 2 } },
        },
        {
          ...base('words'),
          kind: 'text-label',
          source: {
            kind: 'text',
            text: 'Glue here',
            at: { x: 5, y: 60 },
            sizeMm: 4,
            rotationRad: 0,
          },
        },
      ] satisfies Feature[],
    },
    {
      id: 'crease',
      name: 'Crease',
      quantity: 1,
      features: [
        {
          ...base('only-fold'),
          kind: 'fold-line',
          direction: 'valley',
          source: { kind: 'path', path: line([200, 0], [200, 30]) },
        },
      ] satisfies Feature[],
    },
  ],
};

const resolved = evaluate(EVERY_ROLE);
const everything = buildExportScene(resolved, EVERY_ROLE.name);
const rolesIn = (scene: ExportScene): Set<LayerRole> =>
  new Set(
    scene.parts.flatMap((part) => [
      ...part.paths.map((item) => item.role),
      ...part.texts.map((text) => text.role),
    ]),
  );
const same = (a: readonly LayerRole[], b: readonly LayerRole[]) =>
  a.length === b.length && a.every((role) => b.includes(role));

describe('the presets table', () => {
  it('has the three intents the docs name', () => {
    expect(EXPORT_INTENTS).toEqual(['template-print', 'laser-cut', 'stitch-guide']);
  });

  it('draws every role from the domain’s list, and construction is not one that prints', () => {
    for (const roles of Object.values(EXPORT_PRESETS)) {
      for (const role of roles) expect(LAYER_ROLES).toContain(role);
    }
    expect(EXPORT_ROLES).not.toContain('construction');
    expect(EXPORT_PRESETS['template-print']).toEqual(EXPORT_ROLES);
  });

  it('puts the cutting roles, and only them, in a laser cut', () => {
    expect(EXPORT_PRESETS['laser-cut']).toEqual(EXPORT_ROLES.filter(isCutting));
    expect(EXPORT_PRESETS['laser-cut']).toEqual(['cut', 'hardware']);
  });

  it('names an intent from the roles that make it, in any order, and no other set', () => {
    expect(intentOf(['hardware', 'cut'])).toBe('laser-cut');
    expect(intentOf(['stitch-holes', 'stitch'])).toBe('stitch-guide');
    expect(intentOf(['cut'])).toBeNull();
    fc.assert(
      fc.property(fc.subarray([...EXPORT_ROLES]), (roles) => {
        const matching = EXPORT_INTENTS.filter((intent) => same(EXPORT_PRESETS[intent], roles));
        expect(intentOf(roles)).toBe(matching[0] ?? null);
      }),
    );
  });
});

describe('a scene built for some roles (6.4)', () => {
  it('holds every role of the project when none is asked for: today’s scene', () => {
    expect(rolesIn(everything)).toEqual(new Set(EXPORT_ROLES));
    expect(buildExportScene(resolved, EVERY_ROLE.name, EXPORT_ROLES)).toEqual(everything);
  });

  it('holds cut and hardware items and no stitch-line or annotation items for a laser cut', () => {
    const laser = buildExportScene(resolved, EVERY_ROLE.name, EXPORT_PRESETS['laser-cut']);
    expect(rolesIn(laser)).toEqual(new Set(['cut', 'hardware']));
    // Not the caption either: a laser must not cut words.
    expect(laser.parts.flatMap((part) => part.texts)).toEqual([]);
  });

  it('property: only the roles asked for, and every item of them', () => {
    fc.assert(
      fc.property(fc.subarray([...EXPORT_ROLES]), (roles) => {
        const scene = buildExportScene(resolved, EVERY_ROLE.name, roles);
        for (const role of rolesIn(scene)) expect(roles).toContain(role);

        const pathsOf = (s: ExportScene, role: LayerRole) =>
          s.parts.flatMap((part) => part.paths.filter((item) => item.role === role));
        // A caption is the scene's own words, set above whatever of the part is
        // drawn; everything else is the project's, and arrives unchanged.
        const wordsOf = (s: ExportScene, role: LayerRole) =>
          s.parts.flatMap((part) =>
            part.texts.filter((text) => text.role === role && text.source !== part.name),
          );
        for (const role of roles) {
          expect(pathsOf(scene, role)).toEqual(pathsOf(everything, role));
          expect(wordsOf(scene, role)).toEqual(wordsOf(everything, role));
        }
        // A part that is drawn at all has a caption exactly when annotation is asked for.
        for (const part of scene.parts) {
          const captioned = part.texts.some((text) => text.source === part.name);
          expect(captioned).toBe(roles.includes('annotation'));
        }
      }),
    );
  });

  it('property: the box of a part is the box of what it now holds', () => {
    fc.assert(
      fc.property(fc.subarray([...EXPORT_ROLES]), (roles) => {
        const scene = buildExportScene(resolved, EVERY_ROLE.name, roles);
        for (const part of scene.parts) {
          // The caption sits outside the box by design (ExportPart.texts).
          const drawn = [
            ...part.paths.map((item) => item.path),
            ...part.texts.filter((text) => text.source !== part.name).flatMap((t) => t.glyphs),
          ];
          const boxes = drawn.flatMap((path) => PathOps.bbox(path) ?? []);
          expect(boxes.length).toBeGreaterThan(0);
          expect(part.boundsMm.minX).toBeCloseTo(Math.min(...boxes.map((b) => b.minX)), 9);
          expect(part.boundsMm.maxY).toBeCloseTo(Math.max(...boxes.map((b) => b.maxY)), 9);
        }
      }),
    );
  });

  it('drops a part with nothing of the roles asked for, rather than keeping an empty one', () => {
    const stitchOnly = buildExportScene(resolved, EVERY_ROLE.name, EXPORT_PRESETS['stitch-guide']);
    expect(stitchOnly.parts.map((part) => part.id)).toEqual(['panel']);
  });

  it('says what a file of those roles measures: the box of what it holds', () => {
    const all = drawingBoundsOf(everything)!;
    const laser = drawingBoundsOf(
      buildExportScene(resolved, EVERY_ROLE.name, EXPORT_PRESETS['laser-cut']),
    )!;
    // The panel is 100 × 70 mm; the crease and the caption stretch the full drawing past it.
    expect(laser.maxX - laser.minX).toBeCloseTo(100, 6);
    expect(laser.maxY - laser.minY).toBeCloseTo(70, 6);
    expect(all.maxX - all.minX).toBeGreaterThan(100);
    expect(drawingBoundsOf(buildExportScene(resolved, EVERY_ROLE.name, []))).toBeNull();
  });

  it('is what the SVG and the DXF write, with no filter of their own', () => {
    const laser = buildExportScene(resolved, EVERY_ROLE.name, EXPORT_PRESETS['laser-cut']);
    const svg = exportSvg(laser);
    expect([...svg.text.matchAll(/<g\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'cut',
      'hardware',
    ]);
    expect(svg.boundsMm).toEqual(drawingBoundsOf(laser));
    expect(exportDxf(laser).text).not.toMatch(/stitch|annotation|fold|mark/);
  });
});
