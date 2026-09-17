import { DEFAULT_SETTINGS, type Project } from '@leathercad/domain';
import { polyline, uniformRadii } from '@leathercad/geometry';

/**
 * The project behind `fixtures/format/v1.lcp`.
 *
 * One of every parametric shape and one drawn path, so the fixture exercises
 * each branch of the persisted union. It is the baseline for format version 1:
 * whatever the migration chain grows to, it must still open this file and
 * produce this project.
 *
 * Regenerate with `pnpm --filter @leathercad/persist fixture`. Regenerating
 * changes what version 1 *means*, so do it only when version 1 genuinely
 * changes — which, once something has shipped, is never (docs/file-format.md
 * §4.2 rule 1).
 */
/**
 * The project behind `fixtures/format/v2.lcp`.
 *
 * Version 2's addition is the derivation chain, so the fixture holds one: a
 * panel, the stitch line that follows it, and the holes that follow that. The
 * chain is what a v2 reader must be able to reconstruct, and the holes
 * themselves are *not* in the file — evaluation recomputes them.
 */
export function fixtureProjectV2(): Project {
  return {
    id: 'fixture-v2',
    name: 'Format baseline v2',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part-panel',
        name: 'Panel',
        quantity: 1,
        features: [
          {
            id: 'cut-1',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: 105,
                height: 75,
                radii: uniformRadii(8),
                rotation: 0,
              },
            },
          },
          {
            id: 'stitch-1',
            kind: 'stitch-line',
            name: 'Stitch line',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'cut-1',
              op: {
                type: 'offset',
                distanceMm: 3.5,
                side: 'inward',
                run: { kind: 'whole' },
              },
            },
          },
          {
            id: 'holes-1',
            kind: 'stitch-hole-set',
            name: 'Stitch holes',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'stitch-1',
              op: {
                type: 'stitch-holes',
                pitchMm: 3.85,
                mode: 'fit-whole',
                corners: 'hole-at-corner',
                ironLabel: 'KS Blade 3.85 mm',
              },
            },
          },
        ],
      },
      {
        id: 'part-pocket',
        name: 'Pocket',
        quantity: 2,
        features: [
          {
            id: 'cut-2',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: 95,
                height: 60,
                radii: uniformRadii(4),
                rotation: 0,
              },
            },
          },
          {
            id: 'stitch-2',
            kind: 'stitch-line',
            name: 'Stitch line',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'cut-2',
              op: {
                // Three sides: the top edge of a pocket is left open. This is
                // the ordinary seam, and it is why runs exist.
                type: 'offset',
                distanceMm: 3.5,
                side: 'inward',
                run: { kind: 'between', fromAnchor: 0, toAnchor: 3 },
              },
            },
          },
        ],
      },
    ],
  };
}

export function fixtureProject(): Project {
  return {
    id: 'fixture-project',
    name: 'Format baseline',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part-rect',
        name: 'Panel',
        quantity: 2,
        features: [
          {
            id: 'feat-rect',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: 105,
                height: 75,
                radii: uniformRadii(8),
                rotation: 0,
              },
            },
          },
        ],
      },
      {
        id: 'part-circle',
        name: 'Rivet hole',
        quantity: 4,
        features: [
          {
            id: 'feat-circle',
            kind: 'cut-contour',
            role: 'inner',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: { type: 'circle', centre: { x: 20, y: 20 }, radius: 2.5 },
            },
          },
        ],
      },
      {
        id: 'part-arc',
        name: 'Strap curve',
        quantity: 1,
        features: [
          {
            id: 'feat-arc',
            kind: 'marking-line',
            purpose: 'alignment',
            name: 'Line',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'arc',
                centre: { x: 50, y: 30 },
                radius: 18,
                startAngle: 0,
                // A round number of radians on purpose: the serialiser rounds
                // every number to six decimals, so an angle like PI/3 comes
                // back very slightly different and the corpus could then only
                // assert approximate equality. See `arcs round-trip` in
                // lcp.test.ts for the behaviour that applies to real arcs.
                sweepAngle: 1.5,
              },
            },
          },
        ],
      },
    ],
  };
}

/**
 * The project behind `fixtures/format/v3.lcp`.
 *
 * Everything version 2 held, plus the hardware hole that is the reason the
 * version moved. Built *from* `fixtureProjectV2` rather than restated, so
 * "one of every persisted kind" cannot drift between the two — a kind added
 * to the v2 baseline is automatically in this one.
 *
 * Note the hole's geometry: a `circle` shape, a variant version 2 already
 * understood. The format grew by a feature kind, not by a new way of holding
 * a position, which is why `v2_to_v3` is an identity.
 */
export function fixtureProjectV3(): Project {
  const previous = fixtureProjectV2();
  const [panel, ...rest] = previous.parts;

  return {
    ...previous,
    id: 'fixture-v3',
    name: 'Format baseline v3',
    parts: [
      {
        ...panel!,
        features: [
          ...panel!.features,
          {
            id: 'hardware-1',
            kind: 'hardware-hole',
            hardwareType: 'rivet',
            name: 'Rivet 4 mm',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              // A 4 mm punch: the record holds the radius.
              shape: { type: 'circle', centre: { x: 12, y: 12 }, radius: 2 },
            },
          },
        ],
      },
      ...rest,
    ],
  };
}

/**
 * The project behind `fixtures/format/v4.lcp`.
 *
 * Everything version 3 held, plus a frozen stitch line: the reason the version
 * moved (slice 4.2b, ADR 0009). Built from `fixtureProjectV3` so "one of every
 * persisted kind" cannot drift between versions.
 */
export function fixtureProjectV4(): Project {
  const previous = fixtureProjectV3();
  const [panel, ...rest] = previous.parts;

  return {
    ...previous,
    id: 'fixture-v4',
    name: 'Format baseline v4',
    parts: [
      {
        ...panel!,
        features: [
          ...panel!.features,
          {
            id: 'frozen-1',
            kind: 'stitch-line',
            name: 'Stitch line',
            visible: true,
            locked: false,
            frozenFrom: 'Outline',
            source: {
              kind: 'path',
              path: polyline(
                [
                  { x: 10, y: 10 },
                  { x: 95, y: 10 },
                  { x: 95, y: 65 },
                  { x: 10, y: 65 },
                ],
                true,
              ),
            },
          },
        ],
      },
      ...rest,
    ],
  };
}

/**
 * Version 5: everything version 4 held, plus a text label.
 *
 * The reason the version moved (slice 4.11b): free words the user typed, with
 * their position and size but never their outlines — those are regenerated by
 * the vendored typeface on load.
 */
export function fixtureProjectV5(): Project {
  const previous = fixtureProjectV4();
  const [panel, ...rest] = previous.parts;

  return {
    ...previous,
    id: 'fixture-v5',
    name: 'Format baseline v5',
    parts: [
      {
        ...panel!,
        features: [
          ...panel!.features,
          {
            id: 'label-1',
            kind: 'text-label',
            name: 'Fold przed szyciem',
            visible: true,
            locked: false,
            source: {
              kind: 'text',
              // Polish on purpose: the characters that could not be exported at
              // all before slice 4.11a have to survive a round trip too.
              text: 'Fold przed szyciem',
              at: { x: 12, y: 30 },
              sizeMm: 3,
              rotationRad: 0,
            },
          },
        ],
      },
      ...rest,
    ],
  };
}

/**
 * Version 6 — a mirrored counterpart.
 *
 * The v5 baseline with a second part whose outline is `cut-1` reflected across
 * a vertical axis and slid along it. What this fixture proves is that the
 * counterpart's **placement** survives a round trip while its **geometry**
 * does not exist in the file at all: a mirror is a relationship, and the shape
 * is recomputed on load like every other derived feature (file-format.md §3.3).
 */
export function fixtureProjectV6(): Project {
  const previous = fixtureProjectV5();

  return {
    ...previous,
    id: 'fixture-v6',
    name: 'Format baseline v6',
    parts: [
      ...previous.parts,
      {
        id: 'part-mirror',
        name: 'Panel mirrored',
        quantity: 1,
        features: [
          {
            id: 'mirror-1',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline mirrored',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'cut-1',
              op: {
                type: 'mirror',
                // A horizontal axis: the wallet case, one piece either side of
                // a fold. Chosen over a vertical one so every number here
                // survives the writer's six-decimal rounding exactly, which
                // keeps this fixture an equality check rather than a
                // near-equality one. What the rounding does to an angle is
                // pinned separately in `fixture.test.ts`.
                axis: { origin: { x: 0, y: -10 }, angleRad: 0 },
                glideMm: 5,
              },
            },
          },
        ],
      },
    ],
  };
}
