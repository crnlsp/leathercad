import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDocument, rectanglePart, rectShape } from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';

/** A 100 × 80 mm panel whose stitch line is set deeper than the panel holds: one error. */
export function oneErrorFile(dir: string): string {
  const panel = rectanglePart('panel', 'outline', 'Body panel', rectShape({ x: 0, y: 0 }, 100, 80));
  const file = join(dir, 'One error.lcp');
  writeFileSync(
    file,
    saveProject(
      {
        ...emptyDocument('one-error').project,
        parts: [
          {
            ...panel,
            features: [
              ...panel.features,
              {
                id: 'stitch',
                name: 'Stitch line',
                visible: true,
                locked: false,
                kind: 'stitch-line',
                source: {
                  kind: 'derived',
                  sourceId: 'outline',
                  op: { type: 'offset', distanceMm: 60, side: 'inward', run: { kind: 'whole' } },
                },
              },
            ],
          },
        ],
      },
      { applicationVersion: '1.6.0', now: () => new Date('2026-11-01T00:00:00Z') },
    ),
  );
  return file;
}
