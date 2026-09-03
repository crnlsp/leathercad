import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

// Slice 0.1 proves the toolchain end to end: TypeScript compiles, Vitest
// resolves workspace source, and the run is green. Real coverage arrives with
// slice 1.1.
describe('@leathercad/core', () => {
  it('is wired into the workspace', () => {
    expect(PACKAGE_NAME).toBe('@leathercad/core');
  });
});
