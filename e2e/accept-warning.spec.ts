import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject, saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

const cardHolder = resolve(import.meta.dirname, '../fixtures/projects/card-holder.lcp');

test('a warning is accepted and un-accepted, one undo step each, and not counted on Print (9.16)', async () => {
  // The card holder's pocket asked to hold a passport: too narrow, a warning.
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-accept-')), 'Passport.lcp');
  const p = loadProject(readFileSync(cardHolder)).project;
  const holds = { content: { kind: 'size', widthMm: 125, heightMm: 88 }, easeMm: 2, fully: false };
  writeFileSync(
    file,
    saveProject(
      {
        ...p,
        parts: p.parts.map((part) => ({
          ...part,
          features: part.features.map((f) => (f.id === 'pocket-stitch' ? { ...f, holds } : f)),
        })),
      } as typeof p,
      { applicationVersion: '1.7.0', now: () => new Date('2026-11-19T00:00:00Z') },
    ),
  );
  const { app, window } = await openApp({ args: [file], size: [1440, 1000] });
  try {
    const print = window.getByTestId('print-problems');
    await expect(print).toHaveAttribute('data-state', 'warning');

    await window.getByTestId('feature-row-pocket-stitch').click();
    const problems = window.getByTestId('feature-problems');
    const narrow = problems.locator('[data-code="POCKET_TOO_NARROW"]');
    await expect(narrow).toHaveCount(1);
    await problems.getByTestId('problem-accept').click();

    // Listed as accepted, and not counted: Print is clear, the drawer says so.
    await expect(narrow).toHaveAttribute('data-accepted', 'true');
    await expect(narrow.getByTestId('problem-accepted')).toHaveText(/Accepted/);
    await expect(print).toHaveAttribute('data-state', 'clear');
    await expect(window.getByTestId('problems-verdict')).toHaveText('1 accepted');
    await expectNoViolations(window, 'an accepted warning');
    await window.screenshot({ path: test.info().outputPath('accepted.png') });

    await window.getByTestId('undo').click();
    await expect(narrow).not.toHaveAttribute('data-accepted', 'true');
    await expect(print).toHaveAttribute('data-state', 'warning');
    await window.getByTestId('redo').click();
    await expect(narrow).toHaveAttribute('data-accepted', 'true');

    await problems.getByTestId('problem-unaccept').click();
    await expect(narrow).not.toHaveAttribute('data-accepted', 'true');
    await expect(problems.getByTestId('problem-accept')).toBeVisible();
    await expect(print).toHaveAttribute('data-state', 'warning');
    await window.getByTestId('undo').click();
    await expect(narrow).toHaveAttribute('data-accepted', 'true');
  } finally {
    await closeApp(app);
    rmSync(dirname(file), { recursive: true, force: true });
  }
});
