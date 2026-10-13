import { MIN_PITCH_MM } from '@leathercad/domain';
import { STARTER_IRONS } from '@leathercad/platform';
import { describe, expect, it } from 'vitest';

import { defaultIron, ironOf, withoutIron, type MakerTools } from './irons.js';

const iron = (id: string, name: string, pitchMm: number) => ({ id, name, pitchMm });
const tools = (irons: MakerTools['irons'], defaultIronId: string | null): MakerTools => ({
  irons,
  defaultIronId,
  stitchMarginMm: 3.5,
  leatherThicknessMm: null,
});

describe('the starter irons', () => {
  it('are all at or above the pitch floor evaluation enforces (5.6)', () => {
    // The panel's pitch field reads MIN_PITCH_MM; an iron is the other way a
    // pitch is chosen there, and must never be one evaluation refuses.
    for (const each of STARTER_IRONS)
      expect(each.pitchMm, each.name).toBeGreaterThanOrEqual(MIN_PITCH_MM);
  });
});

describe('the maker’s irons (U.13)', () => {
  const two = [iron('a', 'Diamond 3.85', 3.85), iron('b', 'French 3.85', 3.85)];

  it('finds the iron a hole set was made with by its name and pitch, not its pitch alone', () => {
    expect(ironOf(two, 3.85, 'French 3.85')?.id).toBe('b');
    expect(ironOf(two, 3.85, undefined)).toBeUndefined();
    expect(ironOf(two, 3.0, 'French 3.85')).toBeUndefined();
  });

  it('gives the default iron, if the maker has one', () => {
    expect(defaultIron(tools(two, 'b'))?.name).toBe('French 3.85');
    expect(defaultIron(tools([], null))).toBeUndefined();
  });

  it('moves the default to the first iron left when the default is deleted, and keeps it otherwise', () => {
    expect(withoutIron(tools(two, 'a'), 'a')).toEqual({ irons: [two[1]], defaultIronId: 'b' });
    expect(withoutIron(tools(two, 'a'), 'b')).toEqual({ irons: [two[0]], defaultIronId: 'a' });
    expect(withoutIron(tools([two[0]!], 'a'), 'a')).toEqual({ irons: [], defaultIronId: null });
  });
});
