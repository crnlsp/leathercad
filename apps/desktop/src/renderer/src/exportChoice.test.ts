import { emptyDocument, rectShape, rectanglePart } from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { EXPORT_ROLES } from '@leathercad/export';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { overlappingExportParts, withRole } from './exportChoice.js';

describe('ticking a layer in the export dialog (6.4)', () => {
  it('adds a role in the domain’s order, and takes it out again', () => {
    expect(withRole(['hardware'], 'cut', true)).toEqual(['cut', 'hardware']);
    expect(withRole(['cut', 'hardware'], 'cut', false)).toEqual(['hardware']);
  });

  it('property: exactly the one role changes, and the order never does', () => {
    fc.assert(
      fc.property(
        fc.subarray([...EXPORT_ROLES]),
        fc.constantFrom(...EXPORT_ROLES),
        fc.boolean(),
        (roles, role, kept) => {
          const next = withRole(roles, role, kept);
          expect(next.includes(role)).toBe(kept);
          for (const other of EXPORT_ROLES.filter((each) => each !== role)) {
            expect(next.includes(other)).toBe(roles.includes(other));
          }
          expect(next).toEqual(EXPORT_ROLES.filter((each) => next.includes(each)));
        },
      ),
    );
  });
});
describe('the export overlap advisory (Q43)', () => {
  const resolved = evaluate({
    ...emptyDocument('overlap').project,
    parts: [
      rectanglePart('a', 'outline-a', 'Panel', rectShape({ x: 0, y: 0 }, 20, 20)),
      rectanglePart('b', 'outline-b', 'Panel', rectShape({ x: 5, y: 5 }, 20, 20)),
      rectanglePart('c', 'outline-c', 'Separate', rectShape({ x: 100, y: 0 }, 20, 20)),
    ],
  });

  it('includes the names and identities of conflicting pieces, even when names repeat', () => {
    expect(overlappingExportParts(resolved, ['cut']).map(({ id, name }) => ({ id, name }))).toEqual(
      [
        { id: 'a', name: 'Panel' },
        { id: 'b', name: 'Panel' },
      ],
    );
  });

  it('depends on the cut layer, including a custom mix, rather than a preset name', () => {
    fc.assert(
      fc.property(fc.subarray([...EXPORT_ROLES]), (roles) => {
        expect(overlappingExportParts(resolved, roles).map(({ id }) => id)).toEqual(
          roles.includes('cut') ? ['a', 'b'] : [],
        );
      }),
    );
  });
});
