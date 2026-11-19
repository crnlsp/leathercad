import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { approxEq } from '@leathercad/core';
import { emptyDocument } from '@leathercad/document';
import { evaluate, type Project, type ResolvedFeature } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { historyText } from './historyText.js';
import { insertPieces, pieceTemplate } from './partLibrary.js';

const english = createI18n('en');

function fixture(name: string): Project {
  const file = resolve(import.meta.dirname, `../../../../../fixtures/projects/${name}.lcp`);
  return loadProject(new Uint8Array(readFileSync(file))).project;
}

function ids(prefix = 'new'): () => string {
  let n = 0;
  return () => `${prefix}-${String((n += 1))}`;
}

/** Through a file and back, as the template library keeps it. */
const roundTrip = (project: Project): Project =>
  loadProject(
    saveProject(project, {
      applicationVersion: 'test',
      now: () => new Date('2026-11-19T00:00:00Z'),
    }),
  ).project;

const box = (f: ResolvedFeature) => (f.ok ? PathOps.bbox(f.path) : null)!;

/** Every feature of `after` is `before`'s, moved by one offset. */
function sameShapeMoved(before: readonly ResolvedFeature[], after: readonly ResolvedFeature[]) {
  expect(after.map((f) => f.ok)).toEqual(before.map(() => true));
  const offsets = before.map((f, i) => {
    const [was, now] = [box(f), box(after[i]!)];
    return {
      x: now.minX - was.minX,
      y: now.minY - was.minY,
      w: now.maxX - now.minX - (was.maxX - was.minX),
      h: now.maxY - now.minY - (was.maxY - was.minY),
    };
  });
  for (const o of offsets) {
    expect(approxEq(o.x, offsets[0]!.x) && approxEq(o.y, offsets[0]!.y)).toBe(true);
    expect(approxEq(o.w, 0) && approxEq(o.h, 0)).toBe(true);
  }
}

describe('the part library, through templates (9.7)', () => {
  it('saves one piece as a one-piece project, with the settings it was drawn in', () => {
    const wallet = fixture('bifold-wallet');
    const pocket = wallet.parts.find((p) => p.name === 'Card pocket')!;
    const { project, copied } = pieceTemplate(wallet, [pocket.id], 'template-id', 'Card pocket');

    expect(project.id).toBe('template-id');
    expect(project.name).toBe('Card pocket');
    expect(project.settings).toEqual(wallet.settings);
    expect(project.parts.map((p) => p.name)).toEqual(['Card pocket']);
    expect(copied.frozen).toEqual([]);
    expect(copied.dropped).toEqual([]);
    // It is a project a file can hold.
    expect(roundTrip(project).parts).toHaveLength(1);
  });

  it('inserts every piece of every fixture through the paste: the same shapes, moved, nothing shared, one undo step', () => {
    for (const name of ['bifold-wallet', 'card-holder']) {
      const source = fixture(name);
      for (const part of source.parts) {
        const template = roundTrip(pieceTemplate(source, [part.id], 'tpl', part.name).project);
        const target = fixture('bifold-wallet');
        const inserted = insertPieces(template, [template.parts[0]!.id], ids());
        const before = { project: target };
        const after = inserted.command.apply(before);

        // One piece more, and the project's own untouched.
        expect(after.project.parts.slice(0, -1)).toEqual(target.parts);
        const [made] = [...inserted.copies.ids];
        const piece = after.project.parts.at(-1)!;
        expect(piece.id).toBe(made);
        expect(piece.name).toBe(part.name);

        // No id the template or the target already had.
        const old = new Set([
          ...[template, target].flatMap((p) => [
            ...p.parts.map((x) => x.id),
            ...p.parts.flatMap((x) => x.features.map((f) => f.id)),
          ]),
        ]);
        expect(old.has(piece.id)).toBe(false);
        expect(piece.features.some((f) => old.has(f.id))).toBe(false);

        // Evaluates as it did in the template, moved: nothing dangles.
        const was = evaluate(template).parts[0]!.features;
        const now = evaluate(after.project).parts.find((p) => p.part.id === piece.id)!.features;
        sameShapeMoved(was, now);

        // One undo step, worded as what the maker did.
        expect(historyText(inserted.command.label, english.t)).toBe('Insert piece');
      }
    }
  });

  it('inserts several pieces of a template with the seam between them', () => {
    const holder = fixture('card-holder');
    const sewn = holder.seams ?? [];
    expect(sewn.length).toBeGreaterThan(0);
    const inserted = insertPieces(
      holder,
      holder.parts.map((p) => p.id),
      ids(),
    );
    const next = inserted.command.apply(emptyDocument('empty')).project;
    expect(next.parts).toHaveLength(holder.parts.length);
    expect(next.seams).toHaveLength(sewn.length);
    expect(historyText(inserted.command.label, english.t)).toBe(
      `Insert ${String(holder.parts.length)} pieces`,
    );
  });
});
