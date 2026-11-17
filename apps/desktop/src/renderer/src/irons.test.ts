import { MIN_PITCH_MM, toothOfStyle } from '@leathercad/domain';
import { STARTER_IRONS } from '@leathercad/platform';
import { describe, expect, it } from 'vitest';

import {
  defaultIron,
  ironOf,
  shownTooth,
  slitRefusal,
  toothOfIron,
  withIron,
  withTypedTooth,
  withoutIron,
  type MakerTools,
} from './irons.js';

const iron = (id: string, name: string, pitchMm: number) => ({ id, name, pitchMm });
const tools = (irons: MakerTools['irons'], defaultIronId: string | null): MakerTools => ({
  irons,
  defaultIronId,
  stitchMarginMm: 3.5,
  leatherThicknessMm: null,
  pocketEaseMm: null,
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

describe('an iron’s tooth (9.26)', () => {
  const op = {
    type: 'stitch-holes' as const,
    pitchMm: 3.0,
    mode: 'fit-whole' as const,
    corners: 'hole-at-corner' as const,
    ironLabel: 'KS Blade 3.0 mm',
  };
  const words = { t: (key: string) => key, enter: 'Enter' } as Parameters<typeof slitRefusal>[2];

  it('takes its style’s tooth at its pitch, French when no style is said', () => {
    expect(toothOfIron(iron('a', 'Old', 3.85))).toEqual(toothOfStyle('french', 3.85));
    expect(toothOfIron({ ...iron('b', 'Kemovan', 3.85), style: 'round' })).toEqual({
      kind: 'round',
      diameterMm: 1.2,
    });
  });

  it('sets the pitch, the tooth and the name together when picked from the Iron menu', () => {
    const japanese = { ...iron('j', 'Sinabroks 3.85', 3.85), style: 'japanese' as const };
    expect(withIron(op, japanese)).toEqual({
      ...op,
      pitchMm: 3.85,
      ironLabel: 'Sinabroks 3.85',
      tooth: toothOfStyle('japanese', 3.85),
    });
  });

  it('shows the French slit the board draws for a set whose iron was not said (D26)', () => {
    expect(shownTooth(op)).toEqual(toothOfStyle('french', 3.0));
  });

  it('makes the iron Custom when a tooth is typed, keeping everything else on the op', () => {
    const typed = withTypedTooth({ ...op, future: 'kept' } as typeof op, {
      kind: 'round',
      diameterMm: 1,
    });
    expect(typed).toMatchObject({ future: 'kept', tooth: { kind: 'round', diameterMm: 1 } });
    expect('ironLabel' in typed).toBe(false);
  });

  it('refuses a slit longer than the pitch, offering the pitch, and takes one up to it', () => {
    expect(slitRefusal(3.0, 3.0, words)).toBeNull();
    expect(slitRefusal(3.1, 3.0, words)).toEqual({
      reason: 'editor.tooth.longerThanPitch',
      use: 3.0,
    });
  });
});
