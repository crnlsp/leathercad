import { EPS_POINT } from '@leathercad/core';
import { LAYER_ROLES, type LayerRole } from '@leathercad/domain';
import {
  PathOps,
  RectOps,
  SegmentOps,
  Shapes,
  Vec2Ops,
  arc,
  cubic,
  line,
  open,
  type Path,
  type Segment,
  type Vec2,
} from '@leathercad/geometry';
import { ROLE_STYLES } from '@leathercad/render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbItems, itemOf, mixedScene, sceneOf, textOf } from '../../test/scenes.js';
import { DEFAULT_PAGE_SETUP } from '../paper.js';
import { PRINT_STYLES, type ExportScene } from '../scene.js';
import { planSheets } from '../sheetPlan.js';
import { exportSvg } from './writer.js';

/**
 * SVG export (6.2), measured the way a reader of the file would: the output is
 * parsed back by hand — no SVG library — and what it says is compared with the
 * model. Nothing here asserts on the code that wrote it.
 */

// ── Reading the file back ────────────────────────────────────────────────────

interface Element {
  readonly tag: 'path' | 'circle';
  readonly attrs: Readonly<Record<string, string>>;
}

interface Group {
  readonly id: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly elements: readonly Element[];
}

interface Parsed {
  readonly root: Readonly<Record<string, string>>;
  readonly title: string | null;
  readonly groups: readonly Group[];
}

function attributesOf(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
}

function parseSvg(text: string): Parsed {
  const root = /<svg\b([^>]*)>/.exec(text)!;
  const title = /<title>([\s\S]*?)<\/title>/.exec(text);
  const groups = [...text.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/g)].map((m) => {
    const attrs = attributesOf(m[1]!);
    return {
      id: attrs['id']!,
      attrs,
      elements: [...m[2]!.matchAll(/<(path|circle)\b([^>]*)\/>/g)].map((e) => ({
        tag: e[1] as Element['tag'],
        attrs: attributesOf(e[2]!),
      })),
    };
  });
  return { root: attributesOf(root[1]!), title: title?.[1] ?? null, groups };
}

const groupOf = (parsed: Parsed, id: string): Group =>
  parsed.groups.find((group) => group.id === id) ?? { id, attrs: {}, elements: [] };

/** A `d` as its commands: the letter, then its numbers. */
function commandsOf(d: string): Array<{ command: string; numbers: number[] }> {
  return [...d.matchAll(/([MLCAZ])([^MLCAZ]*)/g)].map((m) => ({
    command: m[1]!,
    numbers: m[2]!.trim() === '' ? [] : m[2]!.trim().split(/\s+/).map(Number),
  }));
}

/**
 * The arc an SVG `A` command draws, from the spec's own conversion from endpoint
 * to centre form (SVG 1.1 §F.6.5, for a circle). Written out here rather than
 * borrowed from the geometry layer, so the sweep flag is read by a second
 * implementation.
 */
function arcFromEndpoints(from: Vec2, to: Vec2, r: number, large: number, sweep: number) {
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const squared = dx * dx + dy * dy;
  // Radii too small for the chord are scaled up, as the spec says.
  const radius = squared > r * r ? Math.sqrt(squared) : r;
  const factor = Math.sqrt(Math.max(0, (radius * radius - squared) / squared));
  const sign = large === sweep ? -1 : 1;
  const centre = {
    x: sign * factor * dy + (from.x + to.x) / 2,
    y: sign * factor * -dx + (from.y + to.y) / 2,
  };
  const start = Math.atan2(from.y - centre.y, from.x - centre.x);
  const end = Math.atan2(to.y - centre.y, to.x - centre.x);
  let delta = end - start;
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
  return arc(centre, radius, start, delta);
}

/** What an element draws, as a geometry path in the file's own coordinates. */
function drawn(element: Element): Path {
  if (element.tag === 'circle') {
    const { cx, cy, r } = element.attrs;
    return Shapes.circle({ x: Number(cx), y: Number(cy) }, Number(r));
  }
  const segments: Segment[] = [];
  let at: Vec2 = { x: 0, y: 0 };
  let begin = at;
  for (const { command, numbers: n } of commandsOf(element.attrs['d']!)) {
    if (command === 'M') {
      at = { x: n[0]!, y: n[1]! };
      begin = at;
    } else if (command === 'L') {
      const to = { x: n[0]!, y: n[1]! };
      segments.push(line(at, to));
      at = to;
    } else if (command === 'C') {
      const to = { x: n[4]!, y: n[5]! };
      segments.push(cubic(at, { x: n[0]!, y: n[1]! }, { x: n[2]!, y: n[3]! }, to));
      at = to;
    } else if (command === 'A') {
      const to = { x: n[5]!, y: n[6]! };
      segments.push(arcFromEndpoints(at, to, n[0]!, n[3]!, n[4]!));
      at = to;
    } else if (Vec2Ops.dist(at, begin) > EPS_POINT) {
      // Z: the line back to where the subpath began.
      segments.push(line(at, begin));
      at = begin;
    }
  }
  return { segments, closed: false };
}

/** The `d` of the only element in a role's group. */
function dOf(parsed: Parsed, role: LayerRole): string {
  const [only, ...rest] = groupOf(parsed, role).elements;
  expect(rest, `one element in ${role}`).toHaveLength(0);
  return only!.attrs['d']!;
}

const svgOf = (scene: ExportScene) => exportSvg(scene).text;

// ── The frame ────────────────────────────────────────────────────────────────

describe('SVG export: the frame (6.2)', () => {
  // A 100 mm line with a 20 mm upright at its end: bounds 100 x 20, nowhere near the origin.
  const ruler = sceneOf([
    itemOf(
      'cut',
      open([line({ x: 10, y: 5 }, { x: 110, y: 5 }), line({ x: 110, y: 5 }, { x: 110, y: 25 })]),
    ),
  ]);

  it('is as wide and tall as the drawing, in millimetres, with a viewBox in the same numbers', () => {
    const { root } = parseSvg(svgOf(ruler));
    expect(root['width']).toBe('100mm');
    expect(root['height']).toBe('20mm');
    expect(root['viewBox']).toBe('0 0 100 20');
    expect(root['xmlns']).toBe('http://www.w3.org/2000/svg');
  });

  it('draws a 100 mm line as 100 user units — and a user unit is a millimetre', () => {
    const d = dOf(parseSvg(svgOf(ruler)), 'cut');
    expect(d).toBe('M 0 20 L 100 20 L 100 0');
    const [from, to] = commandsOf(d).map((c) => c.numbers);
    expect(Math.abs(to![0]! - from![0]!)).toBeCloseTo(100, 6);
  });

  it('puts the drawing at the page’s corner, and says where it was on the board', () => {
    expect(exportSvg(ruler).boundsMm).toEqual({ minX: 10, minY: 5, maxX: 110, maxY: 25 });
  });

  it('carries no transform anywhere: the coordinates are the millimetres', () => {
    const rounded = sceneOf([
      itemOf('cut', Shapes.roundedRect({ x: -30, y: 12 }, 80, 40, 6)),
      itemOf('stitch-holes', Shapes.circle({ x: 0, y: 20 }, 0.5)),
    ]);
    expect(svgOf(rounded)).not.toContain('transform');
    expect(svgOf(ruler)).not.toContain('transform');
  });

  it('is written with plain line feeds, on every platform, and ends with one', () => {
    const text = svgOf(ruler);
    expect(text).not.toContain('\r');
    expect(text.endsWith('</svg>\n')).toBe(true);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
  });

  it('refuses a scene with nothing in it, which has no size to give a page', () => {
    expect(() => exportSvg({ projectName: 'Empty', parts: [] })).toThrow(RangeError);
  });
});

// ── The flip ─────────────────────────────────────────────────────────────────

describe('SVG export: the one Y flip (6.2)', () => {
  it('lands a point at model y = +10 above one at y = 0', () => {
    const scene = sceneOf([
      itemOf('cut', open([line({ x: 0, y: 0 }, { x: 0, y: 10 })])),
      itemOf('mark', open([line({ x: 0, y: 0 }, { x: 20, y: 0 })])),
    ]);
    const [low, high] = commandsOf(dOf(parseSvg(svgOf(scene)), 'cut')).map((c) => c.numbers);
    // SVG's y grows downward, so "above" is the smaller number.
    expect(high![1]).toBeLessThan(low![1]!);
    expect(low![1]).toBeCloseTo(10, 6);
    expect(high![1]).toBeCloseTo(0, 6);
  });

  it('keeps left as left: x is only moved, never mirrored', () => {
    const scene = sceneOf(
      [itemOf('cut', open([line({ x: 40, y: 0 }, { x: 90, y: 0 })]))],
      [textOf('annotation', 'H', { x: 40, y: 1 })],
    );
    const xs = commandsOf(dOf(parseSvg(svgOf(scene)), 'cut')).map((c) => c.numbers[0]);
    expect(xs).toEqual([0, 50]);
  });

  it('keeps a circular arc going the way it went: counter-clockwise stays counter-clockwise', () => {
    // A quarter turn from (10, 0) to (0, 10) about the origin, counter-clockwise on the
    // board. On the page, which is Y-down, that is sweep-flag 0, and the arc bulges away
    // from the origin, not toward it.
    const quarter = open([arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2)]);
    const parsed = parseSvg(svgOf(sceneOf([itemOf('cut', quarter)])));
    const [move, command] = commandsOf(dOf(parsed, 'cut'));
    expect(move!.numbers).toEqual([10, 10]);
    expect(command).toEqual({ command: 'A', numbers: [10, 10, 0, 0, 0, 0, 0] });

    const middle = SegmentOps.pointAt(drawn(parsed.groups[0]!.elements[0]!).segments[0]!, 0.5);
    // The board's midpoint, (7.07, 7.07), on the page: 10 - 7.07 down from the top.
    expect(middle.x).toBeCloseTo(Math.SQRT1_2 * 10, 3);
    expect(middle.y).toBeCloseTo(10 - Math.SQRT1_2 * 10, 3);
  });
});

// ── Layers ───────────────────────────────────────────────────────────────────

describe('SVG export: one group per layer role (6.2)', () => {
  const everyRole = sceneOf(
    [
      itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 50, 30)),
      itemOf('stitch', open([line({ x: 3, y: 3 }, { x: 47, y: 3 })])),
      itemOf('stitch-holes', Shapes.circle({ x: 3, y: 3 }, 0.5)),
      itemOf('fold', open([line({ x: 25, y: 0 }, { x: 25, y: 30 })])),
      itemOf('mark', open([line({ x: 0, y: 15 }, { x: 50, y: 15 })])),
      itemOf('hardware', Shapes.circle({ x: 25, y: 15 }, 2)),
    ],
    [textOf('annotation', 'Wallet', { x: 0, y: 32 })],
  );
  const result = exportSvg(everyRole);
  const parsed = parseSvg(result.text);

  it('names each group by its role, in the role order, and only for roles with something in them', () => {
    expect(parsed.groups.map((group) => group.id)).toEqual([
      'cut',
      'stitch',
      'stitch-holes',
      'fold',
      'mark',
      'hardware',
      'annotation',
    ]);
    // The ids are the domain's role names, which the DXF layers use too.
    for (const group of parsed.groups) expect(LAYER_ROLES).toContain(group.id);
  });

  it('strokes each role at its true width in millimetres, and dashes it at its true rhythm', () => {
    for (const group of parsed.groups) {
      const role = group.id as LayerRole;
      expect(Number(group.attrs['stroke-width']), role).toBeCloseTo(PRINT_STYLES[role].widthMm, 9);
      const dashes = PRINT_STYLES[role].dashMm;
      expect(group.attrs['stroke-dasharray']?.split(' ').map(Number), role).toEqual(
        dashes.length === 0 ? undefined : [...dashes],
      );
    }
    // The values themselves, so a change to the role table is a change here too.
    expect(groupOf(parsed, 'cut').attrs['stroke-width']).toBe('0.25');
    expect(groupOf(parsed, 'stitch').attrs['stroke-dasharray']).toBe('2 2');
    expect(groupOf(parsed, 'fold').attrs['stroke-dasharray']).toBe('7 2 1.5 2');
  });

  it('colours each role as the canvas does, so software that sorts by colour sorts by role', () => {
    for (const group of parsed.groups) {
      expect(group.attrs['stroke'], group.id).toBe(ROLE_STYLES[group.id as LayerRole].colour);
    }
    const colours = new Set(parsed.groups.map((group) => group.attrs['stroke']));
    // Stitch lines and their holes share the canvas's blue; every other role has its own.
    expect(colours.size).toBe(parsed.groups.length - 1);
  });

  it('strokes outlines and leaves them unfilled', () => {
    for (const group of parsed.groups) expect(group.attrs['fill'], group.id).toBe('none');
  });

  it('draws stitch holes as circles at the scene’s true size, in their own group', () => {
    const [hole] = groupOf(parsed, 'stitch-holes').elements;
    expect(hole!.tag).toBe('circle');
    // About (3, 3) on the board: 3 mm from the left, and 3 mm up from the page's foot.
    const height = RectOps.height(result.boundsMm);
    expect(Number(hole!.attrs['cx'])).toBeCloseTo(3, 6);
    expect(Number(hole!.attrs['cy'])).toBeCloseTo(height - 3, 6);
    expect(hole!.attrs['r']).toBe('0.5');
  });

  it('draws any whole circle as a circle: a hardware hole is a circle, not two arcs', () => {
    const [hole] = groupOf(parsed, 'hardware').elements;
    expect(hole!.tag).toBe('circle');
    expect(hole!.attrs['r']).toBe('2');
    expect(Number(hole!.attrs['cx'])).toBeCloseTo(25, 6);
  });

  it('draws words as filled outlines on the annotation layer, never as a font', () => {
    const { elements } = groupOf(parsed, 'annotation');
    expect(elements).toHaveLength(1);
    const [words] = elements;
    expect(words!.attrs).toMatchObject({ fill: ROLE_STYLES.annotation.colour, stroke: 'none' });
    // Six letters, and an "a" and an "e" have counters: more contours than letters.
    expect(words!.attrs['d']!.match(/Z/g)!.length).toBeGreaterThanOrEqual(6);
    expect(result.text).not.toMatch(/<text|font-family/);
  });

  it('leaves a role’s group out when nothing of that role is drawn', () => {
    const only = parseSvg(svgOf(sceneOf([itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 5, 5))])));
    expect(only.groups.map((group) => group.id)).toEqual(['cut']);
  });
});

// ── What is drawn ────────────────────────────────────────────────────────────

describe('SVG export: curves stay curves (6.2)', () => {
  it('keeps arcs as arcs and cubics as cubics, and never turns either into short lines', () => {
    const shape = Shapes.roundedRect({ x: 0, y: 0 }, 60, 40, 8);
    const curve = open([
      cubic({ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 40, y: -30 }, { x: 50, y: 0 }),
    ]);
    const parsed = parseSvg(svgOf(sceneOf([itemOf('cut', shape), itemOf('mark', curve)])));

    const cut = commandsOf(dOf(parsed, 'cut')).map((c) => c.command);
    expect(cut.filter((c) => c === 'A')).toHaveLength(4);
    expect(cut.filter((c) => c === 'L')).toHaveLength(4);
    expect(cut.at(-1)).toBe('Z');
    expect(commandsOf(dOf(parsed, 'mark')).map((c) => c.command)).toEqual(['M', 'C']);
  });

  it('writes an arc longer than a quarter turn as several, so none is left to be near a semicircle', () => {
    // An arc is written by its endpoints and radius, and the reader works the centre out
    // from them: for a half turn that is as sensitive as a square root at zero, and a
    // 0.1 µm rounding of an endpoint moves the far side of a 12.5 mm radius by 0.035 mm.
    const half = open([arc({ x: 0, y: 0 }, 12.5, 0.3, Math.PI)]);
    const commands = commandsOf(dOf(parseSvg(svgOf(sceneOf([itemOf('cut', half)]))), 'cut'));
    const arcs = commands.filter((c) => c.command === 'A');
    expect(arcs).toHaveLength(2);
    for (const { numbers } of arcs) {
      // Radius twice, no rotation, the small arc, and counter-clockwise on the board.
      expect(numbers.slice(0, 5)).toEqual([12.5, 12.5, 0, 0, 0]);
    }
  });

  it('writes a whole turn that is part of a longer path as arcs, not as nothing', () => {
    // An arc between identical points draws nothing at all in SVG.
    const turned = open([
      arc({ x: 0, y: 0 }, 5, 0, 2 * Math.PI),
      line({ x: 5, y: 0 }, { x: 20, y: 0 }),
    ]);
    const commands = commandsOf(dOf(parseSvg(svgOf(sceneOf([itemOf('cut', turned)]))), 'cut'));
    expect(commands.filter((c) => c.command === 'A')).toHaveLength(4);
  });

  it('draws a path that does not join up as separate subpaths', () => {
    const apart: Path = {
      segments: [line({ x: 0, y: 0 }, { x: 10, y: 0 }), line({ x: 20, y: 5 }, { x: 30, y: 5 })],
      closed: false,
    };
    const commands = commandsOf(dOf(parseSvg(svgOf(sceneOf([itemOf('cut', apart)]))), 'cut'));
    expect(commands.map((c) => c.command)).toEqual(['M', 'L', 'M', 'L']);
  });

  it('writes every number to the model’s own quantum: four decimals, never an exponent or -0', () => {
    const awkward = open([
      line({ x: 0.123456789, y: -0.00001 }, { x: 1 / 3, y: 2 / 3 }),
      line({ x: 1 / 3, y: 2 / 3 }, { x: 1e-9, y: 100.00005 }),
    ]);
    const d = dOf(parseSvg(svgOf(sceneOf([itemOf('cut', awkward)]))), 'cut');
    expect(d).not.toMatch(/e|-0(?![.\d])|NaN|Infinity/);
    for (const number of d.match(/-?\d+(?:\.\d+)?/g)!) {
      expect(number.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
    // The page is 100.00006 tall: its foot is the first point, 0.00001 below the board's zero.
    expect(d).toBe('M 0.1235 100.0001 L 0.3333 99.3334 L 0 0');
  });
});

describe('SVG export: the title (6.2)', () => {
  const small = [itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 5, 5))];

  it('names the project, with XML’s five troublemakers escaped', () => {
    const { title } = parseSvg(svgOf(sceneOf(small, [], `A & B <wallet> "v2" it's`)));
    expect(title).toBe('A &amp; B &lt;wallet&gt; &quot;v2&quot; it&apos;s');
  });

  it('drops what XML cannot hold at all, and keeps a name’s other letters', () => {
    const text = svgOf(sceneOf(small, [], 'Przegroda\u0001 główna\u0000'));
    expect(parseSvg(text).title).toBe('Przegroda główna');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });

  it('has no title when the project has no name', () => {
    expect(svgOf(sceneOf(small, [], ''))).not.toContain('<title>');
  });
});

// ── The same set as the PDF ──────────────────────────────────────────────────

describe('SVG export: exactly what the PDF prints (6.2)', () => {
  const scene = mixedScene();
  const parsed = parseSvg(svgOf(scene));

  it('draws one element for each thing the PDF draws, role by role', () => {
    const plan = planSheets(scene, DEFAULT_PAGE_SETUP);
    // A taped part is on several sheets and is still one part, as it is in the file.
    const printed = new Map(
      plan.sheets.flatMap((sheet) => sheet.placements.map((p) => [p.part.id, p.part] as const)),
    );
    expect([...printed.keys()].sort()).toEqual(['panel', 'strap']);
    for (const role of LAYER_ROLES) {
      const onPaper = [...printed.values()]
        .flatMap((part) => part.paths)
        .filter((p) => p.role === role);
      const strokes = groupOf(parsed, role).elements.filter(
        (element) => element.attrs['stroke'] !== 'none',
      );
      expect(strokes, role).toHaveLength(onPaper.length);
    }
  });

  it('leaves out the hidden, the failed and the parts with nothing to cut', () => {
    expect(groupOf(parsed, 'cut').elements).toHaveLength(2);
    expect(groupOf(parsed, 'stitch').elements).toHaveLength(1);
    expect(groupOf(parsed, 'stitch-holes').elements.length).toBeGreaterThan(0);
    // A caption for each of the two parts that print, and nothing for the others.
    expect(groupOf(parsed, 'annotation').elements).toHaveLength(2);
  });

  it('keeps each piece whole and as the board has it: the strap is 275 mm, not cut at a sheet', () => {
    const [panel, strap] = groupOf(parsed, 'cut').elements.map((e) => PathOps.bbox(drawn(e))!);
    expect(RectOps.width(panel!)).toBeCloseTo(100, 6);
    expect(RectOps.height(panel!)).toBeCloseTo(70, 6);
    expect(RectOps.width(strap!)).toBeCloseTo(275, 6);
    expect(RectOps.height(strap!)).toBeCloseTo(25, 6);
  });
});

// ── As a property ────────────────────────────────────────────────────────────

/** The most a coordinate, a radius or a control point may move in the file: a few quanta. */
const QUANTA_MM = 5e-4;

describe('SVG export, as a property (6.2)', () => {
  it('draws the model’s curves, flipped and moved, to within a few tenths of a micrometre', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const result = exportSvg(sceneOf(items));
        const { minX, maxY } = result.boundsMm;
        const toFile = (p: Vec2): Vec2 => ({ x: p.x - minX, y: maxY - p.y });
        const toModel = (p: Vec2): Vec2 => ({ x: p.x + minX, y: maxY - p.y });

        const parsed = parseSvg(result.text);
        for (const role of LAYER_ROLES) {
          const model = items.filter((item) => item.role === role).map((item) => item.path);
          const { elements } = groupOf(parsed, role);
          expect(elements, role).toHaveLength(model.length);

          model.forEach((path, i) => {
            const written = drawn(elements[i]!);

            // A cubic is written by its own four points, so they are compared
            // as they are: the geometry layer's closest-point search is a
            // coarse sweep, and it is not an oracle to a few tenths of a
            // micrometre on a loop the size of one.
            const cubics = (p: Path) => p.segments.filter((s) => s.kind === 'cubic');
            const [was, is] = [cubics(path), cubics(written)];
            expect(is, 'cubics').toHaveLength(was.length);
            was.forEach((c, k) => {
              const w = is[k]!;
              for (const key of ['p0', 'p1', 'p2', 'p3'] as const) {
                expect(Vec2Ops.dist(toFile(c[key]), w[key])).toBeLessThan(QUANTA_MM);
              }
            });

            // Lines and arcs are compared as curves: every point of one is on the other.
            const straightAndRound = (p: Path): Path => ({
              segments: p.segments.filter((s) => s.kind !== 'cubic'),
              closed: false,
            });
            const [modelCurves, writtenCurves] = [
              straightAndRound(path),
              straightAndRound(written),
            ];
            for (const segment of modelCurves.segments) {
              for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
                const onPage = toFile(SegmentOps.pointAt(segment, t));
                expect(PathOps.distanceToPath(writtenCurves, onPage)).toBeLessThan(QUANTA_MM);
              }
            }
            for (const segment of writtenCurves.segments) {
              for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                const onBoard = toModel(SegmentOps.pointAt(segment, t));
                expect(PathOps.distanceToPath(modelCurves, onBoard)).toBeLessThan(QUANTA_MM);
              }
            }
          });
        }
      }),
    );
  });

  it('puts everything inside the page it declares', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const { root, groups } = parseSvg(svgOf(sceneOf(items)));
        const width = Number(root['width']!.replace('mm', ''));
        const height = Number(root['height']!.replace('mm', ''));
        expect(root['viewBox']).toBe(`0 0 ${String(width)} ${String(height)}`);

        for (const group of groups) {
          for (const element of group.elements) {
            // A circle is the whole of its circle; its pen never leaves the page either.
            if (element.tag === 'circle') continue;
            for (const { command, numbers } of commandsOf(element.attrs['d']!)) {
              if (command === 'Z') continue;
              // Where the pen goes: the last pair of every command.
              const [x, y] = numbers.slice(-2);
              expect(x!).toBeGreaterThanOrEqual(0);
              expect(x!).toBeLessThanOrEqual(width);
              expect(y!).toBeGreaterThanOrEqual(0);
              expect(y!).toBeLessThanOrEqual(height);
            }
          }
        }
      }),
    );
  });

  it('writes the same file for the same scene', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const scene = sceneOf(items);
        expect(svgOf(scene)).toBe(svgOf(scene));
      }),
      { numRuns: 20 },
    );
  });
});
