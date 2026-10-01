import { describe, expect, it } from 'vitest';

import { offersPaper } from './PrintPreview.js';

describe('whether a printer offers the paper', () => {
  const brother = { name: 'HL-L2442DW', papers: ['A4', 'A5', 'Legal', 'Letter.Fullbleed'] };

  it('reads the names CUPS gives, variants included', () => {
    expect(offersPaper(brother, 'A4')).toBe(true);
    expect(offersPaper(brother, 'Letter')).toBe(true);
    expect(offersPaper(brother, 'A3')).toBe(false);
  });

  it('takes a printer that does not say at its word', () => {
    expect(offersPaper({ name: 'Brother_HL_L2442DW', papers: null }, 'A3')).toBe(true);
    expect(offersPaper(undefined, 'A3')).toBe(true);
  });
});
