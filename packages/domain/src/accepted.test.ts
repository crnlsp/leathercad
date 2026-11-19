import { uniformRadii, type Vec2, PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { acceptance } from './accepted.js';
import { countBySeverity } from './badges.js';
import { diagnose } from './diagnose.js';
import {
  DEFAULT_SETTINGS,
  type AcceptedWarning,
  type Feature,
  type PocketRequirement,
  type Project,
} from './feature.js';
import { problemKey, type Diagnostic } from './problems/index.js';

// ——— Builders ————————————————————————————————————————————————————————————

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

/** A `width` × 75 panel at `origin`, drawn as a rectangle or a path, stitched `inset` in, holed at 3.85. */
function stitchedPanel(
  inset: number,
  origin: Vec2 = { x: 0, y: 0 },
  { width = 105, drawn = false }: { width?: number; drawn?: boolean } = {},
): Feature[] {
  const { x, y } = origin;
  return [
    {
      ...base('cut-1', 'Outline'),
      kind: 'cut-contour',
      role: 'outer',
      source: drawn
        ? {
            kind: 'path',
            path: PathOps.polyline(
              [
                { x, y },
                { x: x + width, y },
                { x: x + width, y: y + 75 },
                { x, y: y + 75 },
              ],
              true,
            ),
          }
        : {
            kind: 'shape',
            shape: { type: 'rect', origin, width, height: 75, radii: uniformRadii(8), rotation: 0 },
          },
    },
    {
      ...base('stitch-1', 'Stitch line'),
      kind: 'stitch-line',
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: { type: 'offset', distanceMm: inset, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      ...base('holes-1', 'Stitch holes'),
      kind: 'stitch-hole-set',
      source: {
        kind: 'derived',
        sourceId: 'stitch-1',
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    },
  ];
}

/** The bifold's card pocket (D20): 89 mm between drawn stitch lines. */
function pocket(holds: PocketRequirement, width = 89): Feature[] {
  return [
    {
      ...base('cut-1', 'Outline'),
      kind: 'cut-contour',
      role: 'outer',
      source: {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: -3, y: -60 },
            { x: width + 3, y: -60 },
            { x: width + 3, y: 0 },
            { x: -3, y: 0 },
          ],
          true,
        ),
      },
    },
    {
      ...base('stitch-1', 'Stitch line'),
      kind: 'stitch-line',
      source: {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 0, y: -4 },
            { x: 0, y: -57 },
            { x: width, y: -57 },
            { x: width, y: -4 },
          ],
          false,
        ),
      },
      holds,
    },
  ];
}

const card = (easeMm: number): PocketRequirement => ({
  content: { kind: 'id-1' },
  easeMm,
  fully: false,
});

function project(features: Feature[], acceptedWarnings?: AcceptedWarning[]): Project {
  return {
    id: 'proj',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-0', name: 'Part 0', quantity: 1, features }],
    ...(acceptedWarnings === undefined ? {} : { acceptedWarnings }),
  };
}

const warningOf = (p: Project, code: string): Diagnostic => {
  const found = diagnose(p).find((d) => d.problem.code === code && d.severity === 'warning');
  if (found === undefined) throw new Error(`no ${code} warning`);
  return found;
};

/** Accepts `code`'s warning in `before`, then lists `after`'s diagnostics with that acceptance stored. */
function acceptedIn(before: Feature[], code: string, after: Feature[] = before): Diagnostic[] {
  const accepted = acceptance(project(before), warningOf(project(before), code));
  return [...diagnose(project(after, [accepted]))];
}

/** The same acceptance after it has been through a save: JSON with six decimals. */
const saved = (entry: AcceptedWarning): AcceptedWarning =>
  JSON.parse(
    JSON.stringify(entry, (_, v: unknown) => (typeof v === 'number' ? Number(v.toFixed(6)) : v)),
  ) as AcceptedWarning;

// ——— Tests ———————————————————————————————————————————————————————————————

describe('accepting a warning (9.16)', () => {
  it('stores its key and what it was found from: for DR8, the requirement and the ease', () => {
    const p = project(pocket(card(4)));
    const narrow = warningOf(p, 'POCKET_TOO_NARROW');
    expect(acceptance(p, narrow)).toEqual({
      problemKey: problemKey(narrow.problem),
      cause: { content: { kind: 'id-1' }, easeMm: 4, fully: false },
    });
  });

  it('marks the accepted warning, and only it', () => {
    const found = acceptedIn(pocket(card(4)), 'POCKET_TOO_NARROW');
    expect(found.filter((d) => d.accepted === true).map((d) => d.problem.code)).toEqual([
      'POCKET_TOO_NARROW',
    ]);
  });

  it('leaves a project with nothing accepted listed exactly as before', () => {
    const p = project(pocket(card(4)));
    expect(diagnose({ ...p, acceptedWarnings: [] })).toEqual(diagnose(p));
    expect(diagnose(p).some((d) => 'accepted' in d)).toBe(false);
  });

  it('is not counted: Print and the drawer count only what is not accepted', () => {
    const found = acceptedIn(pocket(card(4)), 'POCKET_TOO_NARROW');
    expect(countBySeverity(found).warning).toBe(
      found.filter((d) => d.severity === 'warning').length - 1,
    );
  });

  it('a DR8 warning comes back when its requirement or ease changes, never otherwise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).map((t) => t / 10),
        fc.integer({ min: 1, max: 100 }).map((t) => t / 10),
        fc.integer({ min: 70, max: 85 }),
        (ease, otherEase, width) => {
          const before = pocket(card(ease), width);
          const narrow = (features: Feature[]) =>
            acceptedIn(before, 'POCKET_TOO_NARROW', features).find(
              (d) => d.problem.code === 'POCKET_TOO_NARROW',
            );
          // Another width — a resized pocket — is not its cause: still accepted.
          expect(narrow(pocket(card(ease), width - 1))?.accepted).toBe(true);
          // The ease is.
          const eased = narrow(pocket(card(otherEase), width));
          expect(eased?.accepted).toBe(otherEase === ease ? true : undefined);
          // And so is what it holds, the same key (SF-H6) notwithstanding.
          const passport = narrow(
            pocket(
              { content: { kind: 'size', widthMm: 125, heightMm: 88 }, easeMm: ease, fully: false },
              width,
            ),
          );
          expect(passport?.accepted).toBeUndefined();
        },
      ),
    );
  });

  it('any other warning is found from stored parameters: moved anywhere it stays accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 14 }).map((t) => t / 10),
        fc.integer({ min: -10_000_000, max: 10_000_000 }).map((t) => t / 10_000),
        fc.integer({ min: -10_000_000, max: 10_000_000 }).map((t) => t / 10_000),
        fc.boolean(),
        (inset, x, y, drawn) => {
          const close = (features: Feature[]) =>
            acceptedIn(
              stitchedPanel(inset, undefined, { drawn }),
              'HOLE_TOO_CLOSE_TO_EDGE',
              features,
            ).find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE');
          expect(close(stitchedPanel(inset, { x, y }, { drawn }))?.accepted).toBe(true);
        },
      ),
    );
  });

  it('any other warning comes back when an inset or the outline changes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 14 }).map((t) => t / 10),
        fc.boolean(),
        (inset, drawn) => {
          const close = (features: Feature[]) =>
            acceptedIn(
              stitchedPanel(inset, undefined, { drawn }),
              'HOLE_TOO_CLOSE_TO_EDGE',
              features,
            ).find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE');
          expect(close(stitchedPanel(inset - 0.2, undefined, { drawn }))?.accepted).toBeUndefined();
          expect(
            close(stitchedPanel(inset, undefined, { drawn, width: 110 }))?.accepted,
          ).toBeUndefined();
        },
      ),
    );
  });

  it('stores nothing computed: every value in a cause is one the project itself stores', () => {
    const leaves = (value: unknown): unknown[] =>
      value !== null && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [value];
    for (const [features, code] of [
      [stitchedPanel(1), 'HOLE_TOO_CLOSE_TO_EDGE'],
      [stitchedPanel(1, { x: 3.3, y: -7.1 }, { drawn: true }), 'HOLE_TOO_CLOSE_TO_EDGE'],
      [pocket(card(4)), 'POCKET_TOO_NARROW'],
    ] as const) {
      const p = project([...features]);
      const stored = new Set(leaves(p.parts));
      const { cause } = acceptance(p, warningOf(p, code));
      for (const value of leaves(cause))
        expect(stored, `${code}: ${String(value)}`).toContain(value);
    }
  });

  it('a renamed subject is the same cause', () => {
    const before = stitchedPanel(1);
    const renamed = before.map((f) => ({ ...f, name: `${f.name} renamed` }));
    const found = acceptedIn(before, 'HOLE_TOO_CLOSE_TO_EDGE', renamed);
    expect(found.find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE')?.accepted).toBe(true);
  });

  it('survives a save: its numbers written to six decimals still match', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 14 }).map((t) => t / 10),
        (inset) => {
          const features = stitchedPanel(inset);
          const entry = saved(
            acceptance(project(features), warningOf(project(features), 'HOLE_TOO_CLOSE_TO_EDGE')),
          );
          const found = diagnose(project(features, [entry]));
          expect(found.find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE')?.accepted).toBe(
            true,
          );
        },
      ),
    );
  });

  it('an error is never accepted, even with a stored entry that names it', () => {
    const features = stitchedPanel(60);
    const error = diagnose(project(features)).find((d) => d.severity === 'error');
    expect(error).toBeDefined();
    expect(() => acceptance(project(features), error!)).toThrow(RangeError);
    const forged: AcceptedWarning = { problemKey: problemKey(error!.problem), cause: null };
    expect(diagnose(project(features, [forged])).some((d) => d.accepted === true)).toBe(false);
  });
});
