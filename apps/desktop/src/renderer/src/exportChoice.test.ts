import { EXPORT_ROLES } from '@leathercad/export';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { withRole } from './exportChoice.js';

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
