import { describe, expect, it } from 'vitest';

import { projectNameOf } from './useProjectFile.js';

/** A project saved without a name is named after its file (8.12): which part of the path. */
describe('the name a file gives a project', () => {
  it('is the file’s name without its extension, on either platform’s paths', () => {
    expect(projectNameOf('/home/m/Portfel.lcp')).toBe('Portfel');
    expect(projectNameOf('C:\\Wzory\\Pasek v1.2.LCP')).toBe('Pasek v1.2');
  });

  it('keeps every other dot: "Wallet v1.2" is a name', () => {
    expect(projectNameOf('/p/Wallet v1.2.lcp')).toBe('Wallet v1.2');
  });
});
