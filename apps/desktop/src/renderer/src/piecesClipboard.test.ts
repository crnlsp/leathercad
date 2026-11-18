import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { approxEq } from '@leathercad/core';
import { emptyDocument, partSelectionOf, selectionOf } from '@leathercad/document';
import { evaluate, type Project, type ResolvedFeature } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { InvalidProjectFileError, loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { historyText } from './historyText.js';
import { copyNotice, copySelection, duplicateSelection, pasteCommand } from './piecesClipboard.js';

const english = createI18n('en');

function fixture(name: string): Project {
  const file = resolve(import.meta.dirname, `../../../../../fixtures/projects/${name}.lcp`);
  return loadProject(new Uint8Array(readFileSync(file))).project;
}

/** Ids no project already holds. */
function ids(): () => string {
  let n = 0;
  return () => `pasted-${String((n += 1))}`;
}

const pocketOf = (project: Project) => project.parts.find((p) => p.name === 'Card pocket')!;

describe('copying and pasting pieces between projects (8.8b)', () => {
  it("pastes the bifold's card pocket into a new project as it was, moved, its stitching its own", () => {
    const wallet = fixture('bifold-wallet');
    const pocket = pocketOf(wallet);
    const copied = copySelection(wallet, partSelectionOf([pocket.id]))!;
    const { command, partIds } = pasteCommand(copied.clipboard, ids(), { x: 400, y: 300 });

    const next = command.apply(emptyDocument('new')).project;

    // Every feature drawn as in the wallet, moved by one offset.
    const before = evaluate(wallet).parts.find((p) => p.part.id === pocket.id)!.features;
    const after = evaluate(next).parts.find((p) => p.part.id === partIds[0])!.features;
    expect(after.map((f) => f.ok)).toEqual(before.map(() => true));
    const box = (f: ResolvedFeature) => (f.ok ? PathOps.bbox(f.path) : null)!;
    const moved = before.map((f, i) => {
      const [was, now] = [box(f), box(after[i]!)];
      return {
        x: now.minX - was.minX,
        y: now.minY - was.minY,
        w: now.maxX - now.minX - (was.maxX - was.minX),
      };
    });
    for (const m of moved) {
      expect(approxEq(m.x, moved[0]!.x) && approxEq(m.y, moved[0]!.y) && approxEq(m.w, 0)).toBe(
        true,
      );
    }
    const holes = (list: typeof before) => list.find((f) => f.ok && f.holes !== undefined);
    const [h0, h1] = [holes(before), holes(after)];
    expect(h1?.ok === true && h0?.ok === true && h1.holes!.count).toBe(
      h0?.ok === true && h0.holes!.count,
    );

    // Its stitch holes follow its own stitch line, and nothing names the wallet.
    const pasted = next.parts[0]!;
    const text = JSON.stringify(pasted);
    const named = new Set<string>();
    JSON.stringify(pasted, (key, value: unknown) => {
      if (['id', 'sourceId', 'featureId', 'foldId', 'holeSetId'].includes(key))
        named.add(String(value));
      return value;
    });
    const walletIds = [
      wallet.id,
      ...wallet.parts.flatMap((p) => [p.id, ...p.features.map((f) => f.id)]),
    ];
    expect(walletIds.filter((id) => named.has(id))).toEqual([]);
    expect(text).not.toContain(wallet.name);
  });

  it('copies the pieces a selection of features is in', () => {
    const wallet = fixture('bifold-wallet');
    const pocket = pocketOf(wallet);

    const copied = copySelection(wallet, selectionOf([pocket.features[1]!.id]))!;

    expect(copied.clipboard.count).toBe(1);
  });

  it('copies nothing when nothing is selected', () => {
    expect(copySelection(fixture('bifold-wallet'), selectionOf([]))).toBeNull();
  });

  it('carries the card holder’s seams when both its pieces are copied', () => {
    const holder = fixture('card-holder');
    const copied = copySelection(holder, partSelectionOf(holder.parts.map((p) => p.id)))!;

    const next = pasteCommand(copied.clipboard, ids(), null).command.apply(emptyDocument('new'));

    expect(next.project.seams).toHaveLength(holder.seams!.length);
  });

  it('refuses a clipboard that is not a copy, by the file’s error', () => {
    expect(() => pasteCommand({ text: '{"parts":[{}]}', count: 1 }, ids(), null)).toThrow(
      InvalidProjectFileError,
    );
  });

  it('says nothing when the copy brings everything as it was', () => {
    const wallet = fixture('bifold-wallet');
    const copied = copySelection(wallet, partSelectionOf([pocketOf(wallet).id]))!;

    expect(copyNotice(copied, english)).toBeNull();
  });

  it('names what will paste frozen and what will be left out, before it is pasted', () => {
    const copied = {
      clipboard: { text: '', count: 1 },
      frozen: [
        { featureName: 'Outline mirrored', partName: 'Left' },
        { featureName: 'Stitch line mirrored', partName: 'Left' },
      ],
      dropped: [{ featureName: 'Gap', partName: 'Left' }],
    };

    expect(copyNotice(copied, english)).toBe(
      'Outline mirrored in Left and Stitch line mirrored in Left follow pieces you did not copy, ' +
        'so they will paste as the shapes they are now. Gap in Left points at a piece you did ' +
        'not copy, so it will be left out.',
    );
  });

  it('names a paste for Undo by how many pieces it brought', () => {
    expect(historyText({ action: 'paste', count: 1 }, english.t)).toBe('Paste piece');
    expect(historyText({ action: 'paste', count: 3 }, english.t)).toBe('Paste 3 pieces');
  });
});

describe('duplicating any set of pieces (8.8b)', () => {
  const subsets = <T>(items: readonly T[]): T[][] =>
    Array.from({ length: 2 ** items.length - 1 }, (_, i) =>
      items.filter((_, bit) => ((i + 1) >> bit) & 1),
    );

  for (const name of ['bifold-wallet', 'card-holder', 'key-fob', 'coaster']) {
    it(`leaves no dangling reference and keeps the seams between them (${name})`, () => {
      const project = fixture(name);
      for (const chosen of subsets(project.parts.slice(0, 5))) {
        const chosenIds = new Set(chosen.map((p) => p.id));
        const made = duplicateSelection(project, partSelectionOf([...chosenIds]), ids())!;
        const next = made.command.apply({ ...emptyDocument('x'), project }).project;

        expect(next.parts).toHaveLength(project.parts.length + chosen.length);
        expect(next.parts.slice(0, project.parts.length)).toEqual(project.parts);
        expect(made.partIds).toHaveLength(chosen.length);

        // Every id a feature or seam names is a feature that exists.
        const features = new Set(next.parts.flatMap((p) => p.features.map((f) => f.id)));
        const named: string[] = [];
        JSON.stringify(next.parts.slice(project.parts.length), (key, value: unknown) => {
          if (['sourceId', 'featureId', 'foldId', 'holeSetId'].includes(key))
            named.push(String(value));
          return value;
        });
        for (const seam of next.seams ?? []) named.push(seam.a.holeSetId, seam.b.holeSetId);
        expect(named.filter((id) => !features.has(id))).toEqual([]);

        // Seams between chosen pieces come twice; any other is not copied.
        const holeSetsOf = (ps: typeof chosen) =>
          new Set(ps.flatMap((p) => p.features.map((f) => f.id)));
        const inside = holeSetsOf(chosen);
        const between = (project.seams ?? []).filter(
          (s) => inside.has(s.a.holeSetId) && inside.has(s.b.holeSetId),
        );
        expect(next.seams ?? []).toHaveLength((project.seams ?? []).length + between.length);
      }
    });
  }

  it('does nothing for a selection in no piece', () => {
    expect(duplicateSelection(fixture('coaster'), selectionOf([]), ids())).toBeNull();
  });
});
