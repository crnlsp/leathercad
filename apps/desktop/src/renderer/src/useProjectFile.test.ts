import { describe, expect, it } from 'vitest';

import { fileName } from './useProjectFile.js';

describe('fileName', () => {
  it('is the last part of a path, whichever separator the platform uses', () => {
    expect(fileName('/home/maker/Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('C:\\Users\\maker\\Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('Wallet.lcp')).toBe('Wallet.lcp');
  });
});
