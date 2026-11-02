import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_CORRECTION } from '@leathercad/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrinterCorrections, parsePrinters } from './printerCorrections.js';

/**
 * `printers.json` (7.5): each printer's scale correction, in the app's
 * configuration directory and never in a project. A damaged file is no
 * correction — never a crash, never a wrong scale.
 */

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-printers-'));
  file = join(dir, 'printers.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('reading printers.json', () => {
  it('knows no correction before one is stored', () => {
    expect(new PrinterCorrections(file).of('Brother_HL_L2442DW')).toEqual(NO_CORRECTION);
  });

  it('reads a damaged file as no correction at all', () => {
    for (const text of ['{', 'null', '[]', '"x"', '{"version":1,"corrections":[1]}']) {
      expect(parsePrinters(text).size, text).toBe(0);
    }
  });

  it('keeps each usable correction, and drops one beyond ±2 % or not a number', () => {
    const corrections = parsePrinters(
      JSON.stringify({
        version: 1,
        corrections: {
          Laser: { x: 1.004, y: 0.997 },
          Wrong: { x: 1.03, y: 1 },
          Text: { x: '1.001', y: 1 },
          Half: { x: 1.001 },
          '': { x: 1.001, y: 1 },
        },
      }),
    );
    expect([...corrections]).toEqual([['Laser', { x: 1.004, y: 0.997 }]]);
  });
});

describe('storing a correction', () => {
  it('stores it for that printer only, and reads it back at the next start', async () => {
    const store = new PrinterCorrections(file);
    await store.set('Laser', { x: 1.004, y: 0.997 });

    expect(store.of('Laser')).toEqual({ x: 1.004, y: 0.997 });
    expect(store.of('Inkjet')).toEqual(NO_CORRECTION);
    expect(new PrinterCorrections(file).of('Laser')).toEqual({ x: 1.004, y: 0.997 });
  });

  it('forgets it with null, back to no correction', async () => {
    const store = new PrinterCorrections(file);
    await store.set('Laser', { x: 1.004, y: 0.997 });
    await store.set('Laser', null);

    expect(new PrinterCorrections(file).of('Laser')).toEqual(NO_CORRECTION);
  });

  it('refuses what came over IPC unchecked: beyond ±2 %, not a number, or no printer', async () => {
    const store = new PrinterCorrections(file);
    await expect(store.set('Laser', { x: 1.03, y: 1 })).rejects.toThrow();
    await expect(store.set('Laser', { x: Number.NaN, y: 1 })).rejects.toThrow();
    await expect(store.set('Laser', 'big')).rejects.toThrow();
    await expect(store.set('', { x: 1.001, y: 1 })).rejects.toThrow();
    await expect(store.set(42, { x: 1.001, y: 1 })).rejects.toThrow();

    expect(store.of('Laser')).toEqual(NO_CORRECTION);
    expect(() => readFileSync(file)).toThrow();
  });

  it('keeps the correction it had when the file cannot be written', async () => {
    const store = new PrinterCorrections(file);
    await store.set('Laser', { x: 1.004, y: 0.997 });
    // Where the file was, a folder: nothing can be renamed over it.
    rmSync(file);
    mkdirSync(file);

    await expect(store.set('Laser', { x: 1.01, y: 1 })).rejects.toThrow();
    expect(store.of('Laser')).toEqual({ x: 1.004, y: 0.997 });
  });

  it('writes what it reads back, one printer to an entry', async () => {
    writeFileSync(file, 'not json');
    const store = new PrinterCorrections(file);
    await store.set('Laser', { x: 1.004, y: 0.997 });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: 1,
      corrections: { Laser: { x: 1.004, y: 0.997 } },
    });
  });
});
