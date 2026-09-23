import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { v8ToV9 } from './v8_to_v9.js';

/**
 * The behaviour that matters is not that the fields appear — it is **which
 * values they appear with**.
 *
 * Until version 9 nobody could choose their paper: `exportPdf` fell back to
 * `DEFAULT_PAGE_SETUP`, so every project ever saved printed A4 portrait. A
 * migration that filled in anything else would silently change what comes out
 * of the printer for a file someone has already cut from.
 */

const v8 = (settings: Record<string, unknown>): Record<string, unknown> => ({
  id: 'p',
  name: 'Wallet',
  settings,
  parts: [{ id: 'part-1', name: 'Shell', quantity: 1, features: [] }],
});

const OLD_SETTINGS = {
  gridSpacingMm: 1,
  defaultStitchInsetMm: 3.5,
  defaultIronPitchMm: 3.85,
};

describe('v8 → v9 — the project says which paper it prints on', () => {
  it('gives an existing project the paper it has always printed on', () => {
    const migrated = v8ToV9(v8(OLD_SETTINGS)) as { settings: Record<string, unknown> };

    expect(migrated.settings['paper']).toBe('A4');
    expect(migrated.settings['orientation']).toBe('portrait');
  });

  it('matches what a new project gets, so migrated and fresh start alike', () => {
    const migrated = v8ToV9(v8(OLD_SETTINGS)) as { settings: Record<string, unknown> };

    expect(migrated.settings['paper']).toBe(DEFAULT_SETTINGS.paper);
    expect(migrated.settings['orientation']).toBe(DEFAULT_SETTINGS.orientation);
  });

  it('leaves everything else exactly as it was', () => {
    const before = v8(OLD_SETTINGS);
    const migrated = v8ToV9(before) as Record<string, unknown>;

    expect(migrated['id']).toBe('p');
    expect(migrated['name']).toBe('Wallet');
    expect(migrated['parts']).toEqual(before['parts']);
    expect((migrated['settings'] as Record<string, unknown>)['gridSpacingMm']).toBe(1);
    expect((migrated['settings'] as Record<string, unknown>)['defaultStitchInsetMm']).toBe(3.5);
    expect((migrated['settings'] as Record<string, unknown>)['defaultIronPitchMm']).toBe(3.85);
  });

  it('does not overwrite a choice that is already there', () => {
    // Nothing writes version 9 with a paper yet, but a migration that clobbers
    // a value it finds is a migration that destroys work the first time the
    // chain is replayed for any other reason.
    const migrated = v8ToV9(v8({ ...OLD_SETTINGS, paper: 'A3', orientation: 'landscape' })) as {
      settings: Record<string, unknown>;
    };

    expect(migrated.settings['paper']).toBe('A3');
    expect(migrated.settings['orientation']).toBe('landscape');
  });

  it('survives a document that is not shaped like one', () => {
    // Migrations run on raw JSON before validation, so they meet whatever is
    // in the file. Refusing belongs to the schema, which runs next and says
    // which field is wrong.
    expect(v8ToV9(null)).toBe(null);
    expect(v8ToV9({ settings: 'not an object' })).toEqual({ settings: 'not an object' });
    expect(v8ToV9({ name: 'no settings at all' })).toEqual({ name: 'no settings at all' });
  });
});
