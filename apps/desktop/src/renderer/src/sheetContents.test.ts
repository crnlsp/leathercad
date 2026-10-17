import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { paperOptionsFor, sheetPlanFor } from './sheets.js';
import { placementOf, selectedParts, sheetContents, tapedPieces } from './sheetContents.js';

const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/projects/print-test.lcp');
const printTest = () => loadProject(new Uint8Array(readFileSync(FIXTURE))).project;

describe('the Sheets view reads the sheet plan, and nothing else (U.9, 7.4a)', () => {
  it('groups the pieces by sheet as the plan places them', () => {
    const plan = sheetPlanFor(printTest());
    const sheets = sheetContents(plan);
    expect(sheets.map((sheet) => [sheet.number, sheet.count])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(sheets[0]!.pieces.map((piece) => piece.name)).toEqual(['Outer panel', 'Pocket']);
    // The strap is taped: its two tiles are on sheets 2 and 3.
    expect(sheets[1]!.pieces.map((piece) => [piece.name, piece.taped])).toEqual([['Strap', true]]);
    expect(sheets[2]!.pieces.map((piece) => [piece.name, piece.taped])).toEqual([['Strap', true]]);
  });

  it('lists what the plan tapes, and where', () => {
    const plan = sheetPlanFor(printTest());
    expect(tapedPieces(plan).map((entry) => [entry.name, entry.sheets])).toEqual([
      ['Strap', [2, 3]],
    ]);
  });

  it('says nothing is taped when every piece fits whole', () => {
    const project = printTest();
    const whole = paperOptionsFor(project).find(
      (option) => option.paper === 'A4' && option.orientation === 'landscape',
    )!;
    expect(tapedPieces(whole.plan)).toEqual([]);
  });

  it('shows a piece turned only where the plan turned it', () => {
    const project = printTest();
    const a5 = paperOptionsFor(project).find(
      (option) => option.paper === 'A5' && option.orientation === 'landscape',
    )!;
    const turned = sheetContents(a5.plan)
      .flatMap((sheet) => sheet.pieces)
      .filter((piece) => piece.turned)
      .map((piece) => piece.name);
    expect(turned).toEqual(['Pocket']);
    expect(placementOf(a5.plan, project.parts.find((p) => p.name === 'Pocket')!.id)?.turned).toBe(
      true,
    );
  });

  it('agrees with the plan on every paper: each piece is where plan.parts says', () => {
    const project = printTest();
    for (const option of paperOptionsFor(project)) {
      const sheets = sheetContents(option.plan);
      expect(sheets.length).toBe(option.plan.sheets.length);
      for (const [partId, placed] of option.plan.parts) {
        const on = sheets
          .filter((sheet) => sheet.pieces.some((piece) => piece.partId === partId))
          .map((sheet) => sheet.number);
        expect(on, `${option.paper} ${option.orientation}`).toEqual([...placed.sheets]);
      }
      // No piece on a sheet that the plan does not know.
      for (const piece of sheets.flatMap((sheet) => sheet.pieces)) {
        expect(option.plan.parts.has(piece.partId)).toBe(true);
      }
    }
  });

  it('knows no placement for a piece that does not print', () => {
    expect(placementOf(sheetPlanFor(printTest()), 'nothing')).toBeNull();
  });

  it('selects the part of a selected feature, as the board does', () => {
    const project = printTest();
    const part = project.parts[0]!;
    const feature = part.features[0]!;
    const none = new Set<string>();
    expect([...selectedParts(project, { parts: none, features: new Set([feature.id]) })]).toEqual([
      part.id,
    ]);
    expect([...selectedParts(project, { parts: new Set([part.id]), features: none })]).toEqual([
      part.id,
    ]);
    expect(selectedParts(project, { parts: none, features: none }).size).toBe(0);
  });
});
