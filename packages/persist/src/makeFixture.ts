import { DEFAULT_SETTINGS, type Project } from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';

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
