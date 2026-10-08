import { LAYER_ROLES, type LayerRole } from '@leathercad/domain';
import {
  PathOps,
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
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbItems, itemOf, mixedScene, sceneOf, textOf } from '../../test/scenes.js';
import { PRINT_STYLES, type ExportScene } from '../scene.js';
import { exportSvg } from '../svg/writer.js';
import { dashItems, exportDxf } from './writer.js';

/**
 * DXF export (6.5), read back the way a CAM or laser program reads it: tag by
 * tag, by hand — no DXF library — and compared with the model. Nothing here
 * asserts on the code that wrote it.
 */

// ── Reading the file back ────────────────────────────────────────────────────

interface Tag {
  readonly code: number;
  readonly value: string;
}

interface Chunk {
  readonly type: string;
  readonly tags: Tag[];
}

/** A DXF as its (group code, value) pairs, which is all a DXF is. */
function tagsOf(text: string): Tag[] {
  expect(text.endsWith('\r\n'), 'ends with a line end').toBe(true);
  const lines = text.slice(0, -2).split('\r\n');
  expect(lines.length % 2, 'group codes and values come in pairs').toBe(0);
  const tags: Tag[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    expect(lines[i], 'a group code').toMatch(/^ {0,2}\d{1,3}$/);
    tags.push({ code: Number(lines[i]), value: lines[i + 1]! });
  }
  return tags;
}

/** The tags of each section, by name. */
function sectionsOf(text: string): Map<string, Tag[]> {
  const tags = tagsOf(text);
  const sections = new Map<string, Tag[]>();
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.code !== 0 || tags[i]!.value !== 'SECTION') continue;
    const end = tags.findIndex((t, k) => k > i && t.code === 0 && t.value === 'ENDSEC');
    expect(tags[i + 1]!.code, 'a section is named').toBe(2);
    sections.set(tags[i + 1]!.value, tags.slice(i + 2, end));
  }
  return sections;
}

/** Records: each starts at a group code 0 and holds the tags that follow it. */
function recordsOf(tags: readonly Tag[]): Chunk[] {
  const records: Chunk[] = [];
  for (const tag of tags) {
    if (tag.code === 0) records.push({ type: tag.value, tags: [] });
    else records.at(-1)!.tags.push(tag);
  }
  return records;
}

/** The header's variables: a group code 9, then the tags up to the next one. */
function headerOf(text: string): Map<string, Tag[]> {
  const variables = new Map<string, Tag[]>();
  let current: Tag[] = [];
  for (const tag of sectionsOf(text).get('HEADER')!) {
    if (tag.code === 9) {
      current = [];
      variables.set(tag.value, current);
    } else current.push(tag);
  }
  return variables;
}

/** Each table of the TABLES section, with the count it declares and its records. */
function tablesOf(text: string): Array<{ name: string; declared: number; records: Chunk[] }> {
  const tags = sectionsOf(text).get('TABLES')!;
  const tables = [];
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.code !== 0 || tags[i]!.value !== 'TABLE') continue;
    const end = tags.findIndex((t, k) => k > i && t.code === 0 && t.value === 'ENDTAB');
    const body = tags.slice(i + 1, end);
    expect(body[0]!.code, 'a table is named').toBe(2);
    expect(body[1]!.code, 'a table declares how many it holds').toBe(70);
    tables.push({
      name: body[0]!.value,
      declared: Number(body[1]!.value),
      records: recordsOf(body.slice(2)),
    });
  }
  return tables;
}

const valuesOf = (tags: readonly Tag[], code: number): string[] =>
  tags.filter((t) => t.code === code).map((t) => t.value);
const numberOf = (tags: readonly Tag[], code: number): number => Number(valuesOf(tags, code)[0]);
const point = (tags: readonly Tag[], x: number, y: number): Vec2 => ({
  x: numberOf(tags, x),
  y: numberOf(tags, y),
});

interface Entity {
  readonly type: 'LINE' | 'ARC' | 'CIRCLE' | 'POLYLINE';
  readonly layer: string;
  readonly tags: Tag[];
  /** A polyline's vertices, in order. */
  readonly vertices: Vec2[];
  readonly closed: boolean;
}

/**
 * Every entity of the file — a POLYLINE with its VERTEXes gathered, which end at
 * its SEQEND, as R12 draws one — and no kind R12 does not have.
 */
function entitiesOf(text: string): Entity[] {
  const records = recordsOf(sectionsOf(text).get('ENTITIES')!);
  const entities: Entity[] = [];
  for (let i = 0; i < records.length; i++) {
    const { type, tags } = records[i]!;
    if (type === 'LINE' || type === 'ARC' || type === 'CIRCLE') {
      entities.push({ type, layer: valuesOf(tags, 8)[0]!, tags, vertices: [], closed: false });
    } else if (type === 'POLYLINE') {
      const vertices: Vec2[] = [];
      let at = i + 1;
      while (records[at]!.type === 'VERTEX') {
        vertices.push(point(records[at]!.tags, 10, 20));
        at++;
      }
      expect(records[at]!.type, 'a polyline ends at its SEQEND').toBe('SEQEND');
      expect(valuesOf(records[at]!.tags, 8)[0]).toBe(valuesOf(tags, 8)[0]);
      entities.push({
        type,
        layer: valuesOf(tags, 8)[0]!,
        tags,
        vertices,
        closed: (numberOf(tags, 70) & 1) === 1,
      });
      i = at;
    } else {
      throw new Error(`an entity R12 does not have: ${type}`);
    }
  }
  return entities;
}

const layerOf = (entities: readonly Entity[], layer: string): Entity[] =>
  entities.filter((entity) => entity.layer === layer);

/** What an entity draws, as geometry segments in the file's own coordinates. */
function drawn(entity: Entity): Segment[] {
  const { tags } = entity;
  if (entity.type === 'LINE') return [line(point(tags, 10, 20), point(tags, 11, 21))];
  if (entity.type === 'CIRCLE') {
    return Shapes.circle(point(tags, 10, 20), numberOf(tags, 40)).segments.slice();
  }
  if (entity.type === 'ARC') {
    // Always counter-clockwise, from the start angle to the end angle.
    const start = (numberOf(tags, 50) * Math.PI) / 180;
    let sweep = (numberOf(tags, 51) * Math.PI) / 180 - start;
    if (sweep <= 0) sweep += 2 * Math.PI;
    return [arc(point(tags, 10, 20), numberOf(tags, 40), start, sweep)];
  }
  const vertices = entity.closed ? [...entity.vertices, entity.vertices[0]!] : entity.vertices;
  return vertices.slice(1).map((to, i) => line(vertices[i]!, to));
}

const dxfOf = (scene: ExportScene) => exportDxf(scene).text;

// ── The file ─────────────────────────────────────────────────────────────────

describe('DXF export: the file (6.5)', () => {
  // A 100 mm line with a 20 mm upright at its end: bounds 100 x 20, nowhere near the origin.
  const ruler = sceneOf([
    itemOf(
      'cut',
      open([line({ x: 10, y: 5 }, { x: 110, y: 5 }), line({ x: 110, y: 5 }, { x: 110, y: 25 })]),
    ),
  ]);

  it('is R12, with its sections in the order a reader expects, and ends where it should', () => {
    const text = dxfOf(ruler);
    const tags = tagsOf(text);
    expect(tags[0]).toEqual({ code: 0, value: 'SECTION' });
    expect(tags.at(-1)).toEqual({ code: 0, value: 'EOF' });
    expect([...sectionsOf(text).keys()]).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
    expect(tags.filter((t) => t.code === 0 && t.value === 'ENDSEC')).toHaveLength(3);
    expect(headerOf(text).get('$ACADVER')).toEqual([{ code: 1, value: 'AC1009' }]);
  });

  it('is written with CR LF line ends, on every platform, and is plain ASCII', () => {
    const text = dxfOf(sceneOf([itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 5, 5))]));
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect([...text].every((character) => character.charCodeAt(0) < 128)).toBe(true);
    expect(text.split('\r\n').length).toBeGreaterThan(20);
  });

  it('says it is millimetres, and metric, in the header, where an importer looks', () => {
    // R12 has no unit, and these two are the later versions' way of saying one: written
    // anyway, because modern readers honour them whatever the file's version, and a reader
    // that does not know them skips them like any other header variable.
    const header = headerOf(dxfOf(ruler));
    expect(header.get('$INSUNITS')).toEqual([{ code: 70, value: '4' }]);
    expect(header.get('$MEASUREMENT')).toEqual([{ code: 70, value: '1' }]);
  });

  it('gives the drawing’s extents, from the origin: the file’s lower left is the drawing’s', () => {
    const result = exportDxf(ruler);
    expect(result.boundsMm).toEqual({ minX: 10, minY: 5, maxX: 110, maxY: 25 });
    const header = headerOf(result.text);
    const at = (name: string) => header.get(name)!.map((t) => Number(t.value));
    expect(at('$EXTMIN')).toEqual([0, 0, 0]);
    expect(at('$EXTMAX')).toEqual([100, 20, 0]);
  });

  it('refuses a scene with nothing in it, which has no extents to give', () => {
    expect(() => exportDxf({ projectName: 'Empty', parts: [] })).toThrow(RangeError);
  });
});

// ── Y is up ──────────────────────────────────────────────────────────────────

describe('DXF export: Y is up, and nothing is flipped (6.5)', () => {
  it('draws a 100 mm line as 100.0000 units, which is 100 mm', () => {
    const scene = sceneOf([itemOf('cut', open([line({ x: 10, y: 5 }, { x: 110, y: 5 })]))]);
    const [only, ...rest] = entitiesOf(dxfOf(scene));
    expect(rest).toHaveLength(0);
    expect(only!.type).toBe('LINE');
    expect(valuesOf(only!.tags, 10)).toEqual(['0.0000']);
    expect(valuesOf(only!.tags, 11)).toEqual(['100.0000']);
    expect(numberOf(only!.tags, 11) - numberOf(only!.tags, 10)).toBeCloseTo(100, 6);
  });

  it('keeps a point at model y = +10 above one at y = 0: DXF is Y-up, as the model is', () => {
    const scene = sceneOf([
      itemOf('cut', open([line({ x: 0, y: 0 }, { x: 0, y: 10 })])),
      itemOf('mark', open([line({ x: 0, y: 0 }, { x: 20, y: 0 })])),
    ]);
    const [cut] = layerOf(entitiesOf(dxfOf(scene)), 'cut');
    expect(numberOf(cut!.tags, 20)).toBeCloseTo(0, 6);
    expect(numberOf(cut!.tags, 21)).toBeCloseTo(10, 6);
    expect(numberOf(cut!.tags, 21)).toBeGreaterThan(numberOf(cut!.tags, 20));
  });

  it('only moves the drawing: a piece far from the origin and below it keeps its shape', () => {
    const scene = sceneOf([itemOf('cut', Shapes.rect({ x: -300, y: -200 }, 80, 40))]);
    const lines = entitiesOf(dxfOf(scene)).flatMap(drawn);
    const xs = lines.flatMap((l) => (l.kind === 'line' ? [l.a.x, l.b.x] : []));
    const ys = lines.flatMap((l) => (l.kind === 'line' ? [l.a.y, l.b.y] : []));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 80]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 40]);
  });
});

// ── Layers ───────────────────────────────────────────────────────────────────

describe('DXF export: one layer per layer role (6.5)', () => {
  const scene = sceneOf(
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
  const text = dxfOf(scene);
  const tables = tablesOf(text);
  const layerTable = tables.find((table) => table.name === 'LAYER')!;
  const ltypeTable = tables.find((table) => table.name === 'LTYPE')!;
  const nameOf = (record: Chunk) => valuesOf(record.tags, 2)[0];

  it('names each layer by its role, as the SVG names its groups', () => {
    const used = [...new Set(entitiesOf(text).map((entity) => entity.layer))];
    expect(used).toEqual([
      'cut',
      'stitch',
      'stitch-holes',
      'fold',
      'mark',
      'hardware',
      'annotation',
    ]);
    for (const layer of used) expect(LAYER_ROLES).toContain(layer);

    const groups = [...exportSvg(scene).text.matchAll(/<g id="([^"]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(groups);
  });

  it('defines each layer once, and layer 0 beside them, with a colour of its own for each role', () => {
    expect(layerTable.records.map(nameOf)).toEqual([
      '0',
      'cut',
      'stitch',
      'stitch-holes',
      'fold',
      'mark',
      'hardware',
      'annotation',
    ]);
    const colours = layerTable.records.slice(1).map((r) => numberOf(r.tags, 62));
    // Laser software sorts a DXF by colour as well as by layer: each role has its own, and
    // a positive one, which is a layer that is on.
    expect(new Set(colours).size).toBe(colours.length);
    for (const colour of colours) expect(colour).toBeGreaterThan(0);
  });

  it('declares how many layers and linetypes its tables hold, and holds exactly that', () => {
    for (const table of tables) {
      expect(table.declared, table.name).toBe(table.records.length);
      expect(table.records.every((r) => r.type === table.name)).toBe(true);
    }
    expect(tables.map((table) => table.name)).toEqual(['LTYPE', 'LAYER']);
  });

  it('draws a dash at its true rhythm in millimetres, as a linetype the layer uses', () => {
    const ltype = (name: string) => ltypeTable.records.find((r) => nameOf(r) === name)!;
    expect(valuesOf(ltype('CONTINUOUS').tags, 73)).toEqual(['0']);

    const stitch = ltype('stitch');
    expect(valuesOf(stitch.tags, 49)).toEqual(['2.0000', '-2.0000']);
    expect(valuesOf(stitch.tags, 40)).toEqual(['4.0000']);
    expect(valuesOf(stitch.tags, 72)).toEqual(['65']);
    expect(valuesOf(stitch.tags, 73)).toEqual(['2']);

    const fold = ltype('fold');
    expect(valuesOf(fold.tags, 49)).toEqual(['7.0000', '-2.0000', '1.5000', '-2.0000']);
    expect(valuesOf(fold.tags, 40)).toEqual(['12.5000']);

    // A layer uses its own rhythm if the role table gives it one, and CONTINUOUS if not.
    for (const layer of layerTable.records.slice(1)) {
      const role = nameOf(layer) as LayerRole;
      const dashed = PRINT_STYLES[role].dashMm.length > 0;
      expect(valuesOf(layer.tags, 6)).toEqual([dashed ? role : 'CONTINUOUS']);
      expect(ltypeTable.records.map(nameOf)).toContain(valuesOf(layer.tags, 6)[0]);
    }
  });

  it('alternates dash and gap, doubling a pattern of odd length as an SVG does', () => {
    expect(dashItems([2, 2])).toEqual([2, -2]);
    expect(dashItems([7, 2, 1.5, 2])).toEqual([7, -2, 1.5, -2]);
    expect(dashItems([3])).toEqual([3, -3]);
    expect(dashItems([1, 2, 3])).toEqual([1, -2, 3, -1, 2, -3]);
    expect(dashItems([])).toEqual([]);
  });

  it('leaves a role’s layer out when nothing of that role is drawn', () => {
    const only = dxfOf(sceneOf([itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 5, 5))]));
    const layers = tablesOf(only).find((table) => table.name === 'LAYER')!;
    expect(layers.records.map(nameOf)).toEqual(['0', 'cut']);
  });
});

// ── What is drawn ────────────────────────────────────────────────────────────

describe('DXF export: lines, arcs and circles stay what they are (6.5)', () => {
  it('keeps a rounded outline’s arcs as arcs: four lines and four ARCs', () => {
    const entities = entitiesOf(
      dxfOf(sceneOf([itemOf('cut', Shapes.roundedRect({ x: 0, y: 0 }, 60, 40, 8))])),
    );
    expect(entities.map((e) => e.type).sort()).toEqual([
      'ARC',
      'ARC',
      'ARC',
      'ARC',
      'LINE',
      'LINE',
      'LINE',
      'LINE',
    ]);
    for (const entity of entities.filter((e) => e.type === 'ARC')) {
      expect(valuesOf(entity.tags, 40)).toEqual(['8.0000']);
      for (const code of [50, 51]) {
        expect(numberOf(entity.tags, code)).toBeGreaterThanOrEqual(0);
        expect(numberOf(entity.tags, code)).toBeLessThan(360);
      }
    }
  });

  it('writes a counter-clockwise arc from its start to its end, as DXF does', () => {
    // A quarter turn from (10, 0) up to (0, 10), about (0, 0): angles 0 to 90.
    const quarter = open([arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2)]);
    const [entity] = entitiesOf(dxfOf(sceneOf([itemOf('cut', quarter)])));
    expect(entity!.type).toBe('ARC');
    expect(valuesOf(entity!.tags, 50)).toEqual(['0.000000']);
    expect(valuesOf(entity!.tags, 51)).toEqual(['90.000000']);
    // The drawing's box is 10 x 10 and starts at (0, 0), so the centre is where it was.
    expect(valuesOf(entity!.tags, 10)).toEqual(['0.0000']);
    expect(valuesOf(entity!.tags, 20)).toEqual(['0.0000']);
  });

  it('writes a clockwise arc as the counter-clockwise one over the same points: start and end swapped', () => {
    // A quarter turn from (10, 0) down to (0, -10), clockwise on the board. DXF has no
    // clockwise arc: it is the one from -90 degrees (270) up to 0.
    const clockwise = open([arc({ x: 0, y: 0 }, 10, 0, -Math.PI / 2)]);
    const [entity] = entitiesOf(dxfOf(sceneOf([itemOf('cut', clockwise)])));
    expect(valuesOf(entity!.tags, 50)).toEqual(['270.000000']);
    expect(valuesOf(entity!.tags, 51)).toEqual(['0.000000']);
    // The box runs from y = -10, which is moved to 0, so the centre is 10 up.
    expect(valuesOf(entity!.tags, 20)).toEqual(['10.0000']);
  });

  it('writes a whole turn as a CIRCLE: a hole is one, and so is a turn inside a longer path', () => {
    const turned = open([
      arc({ x: 20, y: 0 }, 5, 0, 2 * Math.PI),
      line({ x: 25, y: 0 }, { x: 40, y: 0 }),
    ]);
    const entities = entitiesOf(
      dxfOf(
        sceneOf([
          itemOf('stitch-holes', Shapes.circle({ x: 3, y: 3 }, 0.5)),
          itemOf('cut', turned),
        ]),
      ),
    );
    expect(layerOf(entities, 'stitch-holes').map((e) => e.type)).toEqual(['CIRCLE']);
    expect(
      layerOf(entities, 'cut')
        .map((e) => e.type)
        .sort(),
    ).toEqual(['CIRCLE', 'LINE']);
    const [hole] = layerOf(entities, 'stitch-holes');
    expect(valuesOf(hole!.tags, 40)).toEqual(['0.5000']);
  });

  it('never writes an arc whose angles are the same, which a reader would draw as a whole circle', () => {
    // A sliver of an arc is nothing; a sweep a whisker short of a whole turn is a circle.
    const sliver = arc({ x: 0, y: 0 }, 10, 0, 5e-9);
    const nearlyWhole = arc({ x: 50, y: 0 }, 10, 0, 2 * Math.PI - 2e-9);
    const entities = entitiesOf(
      dxfOf(
        sceneOf([
          itemOf('cut', open([sliver, line(SegmentOps.end(sliver), { x: 20, y: 3 })])),
          itemOf('mark', open([nearlyWhole])),
        ]),
      ),
    );
    expect(layerOf(entities, 'cut').map((e) => e.type)).toEqual(['LINE']);
    expect(layerOf(entities, 'mark').map((e) => e.type)).toEqual(['CIRCLE']);
  });

  it('writes every length to four decimals and every angle to six, never -0 or an exponent', () => {
    const awkward = [
      itemOf('cut', open([line({ x: 0.123456789, y: -0.00001 }, { x: 1 / 3, y: 2 / 3 })])),
      itemOf('cut', open([arc({ x: 50, y: 50 }, 12.5, 0.1234567891, 1 / 7)])),
    ];
    for (const tag of tagsOf(dxfOf(sceneOf(awkward)))) {
      if ([10, 20, 30, 11, 21, 31, 40].includes(tag.code)) {
        expect(tag.value, `group ${String(tag.code)}`).toMatch(/^-?\d+\.\d{4}$/);
      } else if ([50, 51].includes(tag.code)) {
        expect(tag.value, `group ${String(tag.code)}`).toMatch(/^\d+\.\d{6}$/);
      }
      if ([10, 20, 30, 11, 21, 31, 40, 49, 50, 51].includes(tag.code)) {
        expect(tag.value).not.toMatch(/^-0\.0+$|e|NaN|Infinity/);
      }
    }
  });
});

describe('DXF export: curves are flattened to 0.005 mm, since R12 has no spline (6.5)', () => {
  const curve = cubic({ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 40, y: -30 }, { x: 50, y: 0 });

  it('writes a cubic as a POLYLINE whose chords stay within 0.005 mm of it', () => {
    const result = exportDxf(sceneOf([itemOf('mark', open([curve]))]));
    const [polyline, ...rest] = entitiesOf(result.text);
    expect(rest).toHaveLength(0);
    expect(polyline!.type).toBe('POLYLINE');
    expect(polyline!.closed).toBe(false);
    expect(polyline!.vertices.length).toBeGreaterThan(10);

    // The file is moved by its box's corner.
    const { minX, minY } = result.boundsMm;
    const written = PathOps.polyline(polyline!.vertices);
    let worst = 0;
    for (let i = 0; i <= 4000; i++) {
      const p = SegmentOps.pointAt(curve, i / 4000);
      worst = Math.max(worst, PathOps.distanceToPath(written, { x: p.x - minX, y: p.y - minY }));
    }
    // 0.005 of tolerance, and a few quanta for rounding the vertices.
    expect(worst).toBeLessThan(0.0055);
    // The ends are the curve's own.
    expect(Vec2Ops.dist(polyline!.vertices[0]!, { x: -minX, y: -minY })).toBeLessThan(1e-4);
    expect(Vec2Ops.dist(polyline!.vertices.at(-1)!, { x: 50 - minX, y: -minY })).toBeLessThan(1e-4);
  });

  it('joins consecutive cubics into one polyline, and closes a loop of them', () => {
    const loop: Path = {
      segments: [
        cubic({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 20 }, { x: 40, y: 40 }),
        cubic({ x: 40, y: 40 }, { x: 40, y: 60 }, { x: 20, y: 80 }, { x: 0, y: 80 }),
        cubic({ x: 0, y: 80 }, { x: -20, y: 80 }, { x: -20, y: 20 }, { x: 0, y: 0 }),
      ],
      closed: true,
    };
    const [polyline, ...rest] = entitiesOf(dxfOf(sceneOf([itemOf('cut', loop)])));
    expect(rest).toHaveLength(0);
    expect(polyline!.closed).toBe(true);
    // Closed by its flag: the last vertex is not the first written again.
    expect(Vec2Ops.dist(polyline!.vertices[0]!, polyline!.vertices.at(-1)!)).toBeGreaterThan(0.001);
  });

  it('keeps a line beside a curve a LINE, and an arc an ARC', () => {
    const path = open([
      line({ x: -20, y: 0 }, { x: 0, y: 0 }),
      curve,
      arc({ x: 50, y: 10 }, 10, -Math.PI / 2, Math.PI / 2),
    ]);
    const entities = entitiesOf(dxfOf(sceneOf([itemOf('cut', path)])));
    expect(entities.map((e) => e.type)).toEqual(['LINE', 'POLYLINE', 'ARC']);
  });
});

describe('DXF export: words are outline polylines (6.5)', () => {
  it('writes each contour of each letter as a closed POLYLINE on the annotation layer', () => {
    const scene = sceneOf(
      [itemOf('cut', Shapes.rect({ x: 0, y: 0 }, 50, 30))],
      [textOf('annotation', 'Wallet', { x: 0, y: 32 })],
    );
    const entities = layerOf(entitiesOf(dxfOf(scene)), 'annotation');
    // Six letters, and an "a" and an "e" have counters.
    expect(entities.length).toBeGreaterThanOrEqual(6);
    for (const entity of entities) {
      expect(entity.type).toBe('POLYLINE');
      expect(entity.closed).toBe(true);
      expect(entity.vertices.length).toBeGreaterThanOrEqual(3);
    }
    // No TEXT entity and no text style: no font is named, in this file or any other.
    expect(dxfOf(scene)).not.toMatch(/\r\nM?TEXT\r\n|\r\nSTYLE\r\n/);
  });
});

// ── The same set as the PDF ──────────────────────────────────────────────────

describe('DXF export: exactly what the PDF prints, and what the SVG holds (6.5)', () => {
  const scene = mixedScene();
  const entities = entitiesOf(dxfOf(scene));

  it('has the layers the SVG has groups, in the same order', () => {
    const layers = [...new Set(entities.map((e) => e.layer))];
    const groups = [...exportSvg(scene).text.matchAll(/<g id="([^"]+)"/g)].map((m) => m[1]);
    expect(layers).toEqual(groups);
    expect(layers).toEqual(['cut', 'stitch', 'stitch-holes', 'annotation']);
  });

  it('draws a hole for each the scene has, and a straight edge for each straight edge', () => {
    // The panel and the strap, four straight edges each; the stitch line, four.
    expect(layerOf(entities, 'cut').map((e) => e.type)).toEqual(Array(8).fill('LINE'));
    expect(layerOf(entities, 'stitch').map((e) => e.type)).toEqual(Array(4).fill('LINE'));
    const holes = layerOf(entities, 'stitch-holes');
    const inScene = scene.parts.flatMap((p) => p.paths).filter((p) => p.role === 'stitch-holes');
    expect(holes).toHaveLength(inScene.length);
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.every((h) => h.type === 'CIRCLE')).toBe(true);
    expect(layerOf(entities, 'annotation').every((e) => e.type === 'POLYLINE')).toBe(true);
  });

  it('leaves out the hidden, the failed and the parts with nothing to cut', () => {
    const lengths = layerOf(entities, 'cut').map((entity) => {
      const segment = drawn(entity)[0]!;
      return segment.kind === 'line' ? Vec2Ops.dist(segment.a, segment.b) : 0;
    });
    // 100 x 70 and 275 x 25: no 20 x 10 slot, no 50 x 50, no 40 x 40.
    expect(lengths.map(Math.round).sort((a, b) => a - b)).toEqual([
      25, 25, 70, 70, 100, 100, 275, 275,
    ]);
  });
});

// ── As a property ────────────────────────────────────────────────────────────

/** The most a coordinate or a radius may move in the file: a few quanta. */
const QUANTA_MM = 5e-4;
/** A cubic's own tolerance, 0.005 mm, and a few quanta for rounding its vertices. */
const FLAT_MM = 0.0055;

describe('DXF export, as a property (6.5)', () => {
  it('draws the model’s lines, arcs and curves, moved, to within a few tenths of a micrometre', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const result = exportDxf(sceneOf(items));
        const { minX, minY } = result.boundsMm;
        const toFile = (p: Vec2): Vec2 => ({ x: p.x - minX, y: p.y - minY });
        const entities = entitiesOf(result.text);

        for (const role of LAYER_ROLES) {
          const model = items
            .filter((item) => item.role === role)
            .flatMap((item) => item.path.segments);
          const written = layerOf(entities, role);

          // Lines and arcs, compared as curves: every point of one is on the other.
          const modelCurves: Path = {
            segments: model.filter((s) => s.kind !== 'cubic'),
            closed: false,
          };
          // A segment a ten-thousandth of a millimetre long has no length in the file, and the
          // file leaves it out: it is not asked to be there.
          const drawnCurves = modelCurves.segments.filter((s) => SegmentOps.length(s) > 1e-3);
          const fileCurves: Path = {
            segments: written.filter((e) => e.type !== 'POLYLINE').flatMap(drawn),
            closed: false,
          };
          for (const segment of drawnCurves) {
            for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
              const onPage = toFile(SegmentOps.pointAt(segment, t));
              expect(PathOps.distanceToPath(fileCurves, onPage)).toBeLessThan(QUANTA_MM);
            }
          }
          for (const segment of fileCurves.segments) {
            for (const t of [0, 0.25, 0.5, 0.75, 1]) {
              const onPage = SegmentOps.pointAt(segment, t);
              const onBoard = { x: onPage.x + minX, y: onPage.y + minY };
              expect(PathOps.distanceToPath(modelCurves, onBoard)).toBeLessThan(QUANTA_MM);
            }
          }

          // Cubics: the curve stays within its tolerance of the polylines written for it. One
          // that is a point has no polyline to stay near, and nothing to cut.
          const polylines: Path = {
            segments: written.filter((e) => e.type === 'POLYLINE').flatMap(drawn),
            closed: false,
          };
          for (const segment of model.filter((s) => s.kind === 'cubic')) {
            const reach =
              Vec2Ops.dist(segment.p0, segment.p1) +
              Vec2Ops.dist(segment.p1, segment.p2) +
              Vec2Ops.dist(segment.p2, segment.p3);
            // Under a few hundredths of a millimetre across it is within 0.005 of a point, which
            // is nothing to cut, and no polyline is written for it.
            if (reach < 0.05) continue;
            for (let i = 0; i <= 100; i++) {
              const onPage = toFile(SegmentOps.pointAt(segment, i / 100));
              expect(PathOps.distanceToPath(polylines, onPage)).toBeLessThan(FLAT_MM);
            }
          }
        }
      }),
    );
  });

  it('puts everything at or above the origin, and inside the extents the box gives', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const result = exportDxf(sceneOf(items));
        const width = result.boundsMm.maxX - result.boundsMm.minX;
        const height = result.boundsMm.maxY - result.boundsMm.minY;
        for (const entity of entitiesOf(result.text)) {
          // A line's ends and a polyline's vertices. A circle and an arc are inside the box
          // by the box's own definition, and a whole circle's centre is not an end.
          const points =
            entity.type === 'LINE'
              ? [point(entity.tags, 10, 20), point(entity.tags, 11, 21)]
              : entity.vertices;
          for (const p of points) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(width + QUANTA_MM);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(height + QUANTA_MM);
          }
        }
      }),
    );
  });

  it('writes the same file for the same scene', () => {
    fc.assert(
      fc.property(arbItems, (items) => {
        const scene = sceneOf(items);
        expect(dxfOf(scene)).toBe(dxfOf(scene));
      }),
      { numRuns: 20 },
    );
  });
});
