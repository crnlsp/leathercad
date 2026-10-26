import { describe, expect, it } from 'vitest';

import { projectNameOf } from './projectTabs.js';
import { fileName } from './useProjectFile.js';

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

describe('fileName', () => {
  it('is the last part of a path, whichever separator the platform uses', () => {
    expect(fileName('/home/maker/Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('C:\\Users\\maker\\Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('Wallet.lcp')).toBe('Wallet.lcp');
  });
});
