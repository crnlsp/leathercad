import { expect, test, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openApp, withSample, expectNoViolations } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.8 (R-07, mockups 09 and 01): Parts as a tree of pieces. Pieces fold;
 * features nest under what they follow; lock and eye show on hover and
 * keyboard focus, and stay while on; the tree's own keys; a selection on the
 * board opens its piece and scrolls its row into view; and where a piece
 * prints is the Sheets view's to say.
 */

const row = (window: Page, id: string): Locator => window.getByTestId(`feature-row-${id}`);
const piece = (window: Page, id: string): Locator => window.getByTestId(`part-heading-${id}`);
/** Whether all of a row's lock and eye (or eye and menu) can be seen. */
const actionsShown = (target: Locator): Promise<boolean> =>
  target
    .locator('.row-actions')
    .evaluate((actions) =>
      [...actions.children].every((action) => getComputedStyle(action).opacity === '1'),
    );
/** Whether one of a row's toggles can be seen, as its tooltip's anchor shows it. */
const toggleShown = (toggle: Locator): Promise<boolean> =>
  toggle.evaluate(
    (button) => getComputedStyle(button.closest('.tooltip-anchor') ?? button).opacity === '1',
  );

test('the tree reads as mockup 09: nested, counted, and quiet at rest', async () => {
  await withSample(async (window) => {
    const tree = window.getByRole('tree', { name: 'Parts' });
    await expect(window.getByTestId('parts-count')).toHaveText('3 pieces');
    // Outline › Stitch line › Stitch holes, a level deeper each, and the fold beside the outline.
    for (const [id, level] of [
      ['outer-outline', '2'],
      ['outer-stitch', '3'],
      ['outer-holes', '4'],
    ] as const) {
      await expect(row(window, id)).toHaveAttribute('aria-level', level);
    }
    await expect(piece(window, 'outer')).toHaveAttribute('aria-level', '1');
    await expect(window.getByTestId('hole-count-outer-holes')).toHaveText('146');
    await expect(piece(window, 'pocket')).toContainText('×2');
    // Each row is named by all it shows, so speech input reaches it by any of it.
    await expect(row(window, 'outer-holes')).toHaveAccessibleName('Stitch holes, 146 holes');
    await expect(piece(window, 'pocket')).toHaveAccessibleName('Card pocket ×2');
    await expect(piece(window, 'outer').locator('svg.thumbnail path')).toHaveAttribute('d', /^M/);

    // At rest no row shows its lock and eye; hover shows a row's; keyboard
    // focus on a piece shows its eye and menu.
    await window.getByTestId('status-bar').hover();
    expect(await actionsShown(row(window, 'outer-outline'))).toBe(false);
    await row(window, 'outer-outline').hover();
    await expect.poll(() => actionsShown(row(window, 'outer-outline'))).toBe(true);
    await window.getByTestId('status-bar').hover();
    await piece(window, 'lining').focus();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowUp');
    await expect.poll(() => actionsShown(piece(window, 'lining'))).toBe(true);

    // What is on stays in sight: hidden, locked; the mirror mark always.
    await row(window, 'lining-fold').hover();
    await window.getByTestId('feature-visible-lining-fold').click();
    const cutOut = tree.getByRole('treeitem', { name: 'Cut-out', exact: true });
    await cutOut.hover();
    await cutOut.locator('[data-testid^="feature-locked-"]').click();
    await window.getByTestId('status-bar').hover();
    expect(await toggleShown(window.getByTestId('feature-visible-lining-fold'))).toBe(true);
    expect(await toggleShown(cutOut.locator('[data-testid^="feature-locked-"]'))).toBe(true);
    // …and only what is on: the cut-out's eye waits for the pointer.
    expect(await toggleShown(cutOut.locator('[data-testid^="feature-visible-"]'))).toBe(false);
    await expect(tree.locator('[data-testid^="mirrored-mark-"]')).toBeVisible();
    await expect(row(window, 'lining-fold')).toHaveAccessibleDescription('Hidden');
    await expect(cutOut).toHaveAccessibleDescription('Locked');

    // A piece's menu stays while the pointer leaves the row for it.
    await piece(window, 'lining').hover();
    await window.getByTestId('part-menu-lining').click();
    await window.getByTestId('duplicate-part-lining').click();
    await expect(window.getByTestId('part-count')).toHaveText('4');
  });
});

/**
 * Every row of the tree as laid out: its height, how many lines its name
 * takes, and the boxes of what it holds — the name's line boxes, the fold,
 * the thumbnail or mark, the pills, the hole count, and the actions and marks
 * at its end — with what lies outside the row, what overlaps, and whether
 * anything is clipped. Measured, nothing substituted.
 */
async function rowLayouts(window: Page) {
  return window.getByRole('tree').evaluate((tree) =>
    [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].map((item) => {
      const row = item.getBoundingClientRect();
      const line = item.querySelector<HTMLElement>('.tree-line')!;
      const name = line.querySelector('.feature-name, .part-label')!;
      const range = document.createRange();
      range.selectNodeContents(name);
      const parts = [...range.getClientRects()]
        .filter((rect) => rect.width > 0)
        .map((rect, at) => ({ what: `name ${String(at + 1)}`, rect }));
      const lines = new Set(parts.map((part) => Math.round(part.rect.top))).size;
      for (const [what, selector] of [
        ['fold', ':scope > .tree-fold > svg'],
        ['thumbnail', ':scope > svg.thumbnail'],
        ['mark', ':scope > .feature-mark'],
        ['pill', '.badge'],
        ['count', '.row-count'],
        ['action', '.row-actions .icon-toggle'],
        ['mark at the end', '.row-end > .tooltip-anchor > .row-mark'],
      ] as const) {
        line.querySelectorAll(selector).forEach((element, at) => {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0) parts.push({ what: `${what} ${String(at + 1)}`, rect });
        });
      }
      const outside = parts
        .filter(
          ({ rect }) =>
            rect.left < row.left - 0.5 ||
            rect.right > row.right + 0.5 ||
            rect.top < row.top - 0.5 ||
            rect.bottom > row.bottom + 0.5,
        )
        .map(({ what }) => what);
      const overlaps: string[] = [];
      parts.forEach((a, i) =>
        parts.slice(i + 1).forEach((b) => {
          const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (x > 0.5 && y > 0.5) overlaps.push(`${a.what} × ${b.what}`);
        }),
      );
      const top = Math.min(...parts.map(({ rect }) => rect.top));
      const bottom = Math.max(...parts.map(({ rect }) => rect.bottom));
      return {
        row: item.dataset['testid'] ?? '',
        found: parts.map(({ what }) => what),
        height: row.height,
        lines,
        content: bottom - top,
        clipped:
          item.scrollHeight > item.clientHeight ||
          item.scrollWidth > item.clientWidth ||
          line.scrollHeight > line.clientHeight ||
          line.scrollWidth > line.clientWidth,
        outside,
        overlaps,
      };
    }),
  );
}

test('every row is 28 px, or holds its second line whole: nothing clipped, nothing overlapping', async () => {
  await withSample(async (window, app) => {
    // The rows that take a second line, by the maintainer's accepted layout
    // (#90): the deepest "Stitch holes" and "Cut-out mirrored" wrap between
    // their words, and "Card pocket ×2" puts its actions and marks below.
    const tall = [
      'feature-row-outer-holes',
      'feature-row-lining-slot-mirrored',
      'part-heading-pocket',
    ];
    const check = async (state: string): Promise<void> => {
      const rows = await rowLayouts(window);
      expect(rows.length, state).toBe(15);
      for (const row of rows) {
        const where = `${state}: ${row.row}`;
        expect(row.outside, `${where}, outside the row`).toEqual([]);
        expect(row.overlaps, `${where}, overlapping`).toEqual([]);
        expect(row.clipped, `${where}, clipped`).toBe(false);
        if (tall.includes(row.row)) {
          // Taller by its real second line: the content's own extent, and
          // the row's border and padding about it — nothing substituted.
          expect(row.height, where).toBeGreaterThan(28);
          expect(row.height - row.content, where).toBeGreaterThanOrEqual(0);
          expect(row.height - row.content, where).toBeLessThanOrEqual(12);
        } else {
          expect(row.lines, where).toBe(1);
          expect(row.height, where).toBe(28);
        }
      }
      expect(
        rows.filter((row) => row.height !== 28).map((row) => row.row),
        state,
      ).toEqual(tall); // What was measured: the pocket's name, pill, thumbnail, fold, eye and
      // menu — and, hidden, its crossed printer.
      const pocket = rows.find((row) => row.row === 'part-heading-pocket')!;
      expect(pocket.found, state).toEqual(
        expect.arrayContaining([
          'name 1',
          'fold 1',
          'thumbnail 1',
          'pill 1',
          'action 1',
          'action 2',
        ]),
      );
      if (state.includes('hidden')) expect(pocket.found, state).toContain('mark at the end 1');
      const holes = rows.find((row) => row.row === 'feature-row-outer-holes')!;
      expect(holes.found, state).toEqual(
        expect.arrayContaining(['name 1', 'name 2', 'mark 1', 'count 1', 'action 1', 'action 2']),
      );
    };

    for (const width of [1440, 1024]) {
      await resizeWindow(app, window, width, 900);
      await window.getByTestId('status-bar').hover();
      await check(`${String(width)} px, at rest`);
    }
    // The pocket hidden: its crossed eye and crossed printer both show.
    await piece(window, 'pocket').hover();
    await window.getByTestId('part-visible-pocket').click();
    await expect(window.getByTestId('part-not-printed-pocket')).toBeVisible();
    for (const width of [1024, 1440]) {
      await resizeWindow(app, window, width, 900);
      await window.getByTestId('status-bar').hover();
      await check(`${String(width)} px, the pocket hidden`);
    }
  });
});

test('a hole set’s count stays in sight at rest, on hover and on keyboard focus, and nothing moves', async () => {
  await withSample(async (window) => {
    const holes = row(window, 'outer-holes');
    const parts = {
      row: holes,
      name: holes.locator('.feature-name'),
      count: window.getByTestId('hole-count-outer-holes'),
      actions: holes.locator('.row-actions'),
    };
    type Box = { x: number; y: number; width: number; height: number };
    const boxes = async (): Promise<Record<keyof typeof parts, Box>> => {
      const read = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
      return {
        row: await read(parts.row),
        name: await read(parts.name),
        count: await read(parts.count),
        actions: await read(parts.actions),
      };
    };
    const apart = (a: Box, b: Box): boolean => a.x + a.width <= b.x || b.x + b.width <= a.x;

    await window.getByTestId('status-bar').hover();
    const rest = await boxes();
    await holes.hover();
    await expect.poll(() => actionsShown(holes)).toBe(true);
    const hover = await boxes();
    await window.getByTestId('status-bar').hover();
    await row(window, 'outer-stitch').focus();
    await window.keyboard.press('ArrowDown');
    await expect(holes).toBeFocused();
    await expect.poll(() => actionsShown(holes)).toBe(true);
    const focus = await boxes();

    for (const [state, at] of Object.entries({ rest, hover, focus })) {
      await expect(parts.count, state).toBeInViewport();
      expect(apart(at.count, at.actions), `${state}: the actions cover the count`).toBe(true);
      expect(at.row, state).toEqual(rest.row);
      expect(at.name, state).toEqual(rest.name);
      expect(at.count, state).toEqual(rest.count);
    }
  });
});

test('at 208 px no name breaks inside a word, a hidden piece’s with both its marks included', async () => {
  await withSample(async (window, app) => {
    await resizeWindow(app, window, 1024, 700);
    await piece(window, 'pocket').hover();
    await window.getByTestId('part-visible-pocket').click();
    await expect(window.getByTestId('part-not-printed-pocket')).toBeVisible();
    const names = await window.getByRole('tree').evaluate((tree) =>
      [...tree.querySelectorAll('.feature-name, .part-label')].map((name) => {
        const range = document.createRange();
        range.selectNodeContents(name);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        return { name: name.textContent ?? '', lines: lines.size };
      }),
    );
    for (const { name, lines } of names) {
      expect(lines, name).toBeLessThanOrEqual(name.split(' ').length);
    }
  });
});

test('a piece’s marks drop below its name only where its longest word leaves them no room (U.19)', async () => {
  // At 224 px "Card pocket ×2" took two lines with nothing on the second: the
  // row's end wrapped whenever the whole name did not fit on one line, not
  // only where its longest word did not (U.8), and left a blank row.
  await withSample(async (window, app) => {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
    ] as const) {
      await resizeWindow(app, window, width, height);
      const [heading, end] = await piece(window, 'pocket').evaluate((row) => [
        row.querySelector('.part-label')!.getBoundingClientRect().top,
        row.querySelector('.row-end')!.getBoundingClientRect().top,
      ]);
      expect(end! - heading!, `at ${String(width)}`).toBeLessThan(8);
    }
  });
});

test('Tab into the tree changes no selection; the arrows then select', async () => {
  await withSample(async (window) => {
    const selected = window.getByTestId('selected-count');
    const tabInto = async (): Promise<void> => {
      await window.getByTestId('tool-select').focus();
      for (let i = 0; i < 20; i++) {
        await window.keyboard.press('Tab');
        const role = await window.evaluate(() => document.activeElement?.getAttribute('role'));
        if (role === 'treeitem') return;
      }
      throw new Error('Tab never reached the tree');
    };

    // Nothing selected: focus lands on the first row, and selects nothing.
    await expect(selected).toHaveText('0');
    await tabInto();
    await expect(piece(window, 'outer')).toBeFocused();
    await expect(selected).toHaveText('0');

    // Something else selected: focus lands on its row, and the selection stays.
    await row(window, 'pocket-stitch').click();
    await window.getByTestId('status-bar').click();
    await expect(selected).toHaveText('1');
    await tabInto();
    await expect(row(window, 'pocket-stitch')).toBeFocused();
    await expect(row(window, 'pocket-stitch')).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toHaveText('1');

    // The arrows select, as decided.
    await window.keyboard.press('ArrowDown');
    await expect(row(window, 'pocket-holes')).toHaveAttribute('aria-selected', 'true');
    await expect(row(window, 'pocket-stitch')).toHaveAttribute('aria-selected', 'false');
  });
});

test('the tree’s keys move, fold, hide and rename — and the window’s keys still work from a row', async () => {
  await withSample(async (window) => {
    // One Tab stop.
    await expect(window.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await piece(window, 'outer').focus();

    // Down moves, and selection follows focus.
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();
    await expect(row(window, 'outer-outline')).toHaveAttribute('aria-selected', 'true');
    await expect(window.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

    // Left goes to the piece, then closes it; Right opens it, then goes in.
    await window.keyboard.press('ArrowLeft');
    await expect(window.getByTestId('part-heading-outer')).toBeFocused();
    await window.keyboard.press('ArrowLeft');
    await expect(piece(window, 'outer')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(window, 'outer-outline')).toHaveCount(0);
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('part-heading-lining')).toBeFocused();
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('ArrowRight');
    await expect(piece(window, 'outer')).toHaveAttribute('aria-expanded', 'true');
    await window.keyboard.press('ArrowRight');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();

    // Space hides and shows, and Ctrl+Z from the row undoes it.
    const eye = window.getByTestId('feature-visible-outer-outline');
    await window.keyboard.press('Space');
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await window.keyboard.press('Control+z');
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();

    // F2 renames in place: Enter keeps it, as one step of undo; Escape puts it back.
    await window.keyboard.press('F2');
    const field = window.getByTestId('row-name-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Outline');
    await field.fill('Edge');
    await window.keyboard.press('Enter');
    await expect(row(window, 'outer-outline')).toHaveAccessibleName('Edge');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();
    await window.keyboard.press('Control+z');
    await expect(row(window, 'outer-outline')).toHaveAccessibleName('Outline');
    await window.keyboard.press('F2');
    await field.fill('Nothing');
    await window.keyboard.press('Escape');
    await expect(row(window, 'outer-outline')).toHaveAccessibleName('Outline');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();
    // A piece is renamed the same way.
    await window.keyboard.press('Home');
    await window.keyboard.press('F2');
    await field.fill('Outside');
    await window.keyboard.press('Enter');
    await expect(piece(window, 'outer')).toContainText('Outside');

    // The window's keys pass through: a tool's letter, and Delete.
    await window.keyboard.press('End');
    await expect(window.locator('[role="treeitem"]').last()).toBeFocused();
    await window.keyboard.press('KeyR');
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await window.getByTestId('tool-select').click();
    await window.locator('[role="treeitem"]').last().focus();
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('feature-count')).toHaveText('12');
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('feature-count')).toHaveText('11');
  });
});

test('a rename ends with its row: undone away and redone, the row comes back as it was', async () => {
  // macOS's Edit menu undoes while the name field has focus (8.7): the row
  // goes without the field ever losing focus, so nothing said it ended.
  const { app, window } = await openApp();
  const menu = (action: 'undo' | 'redo') =>
    app.evaluate(({ BrowserWindow }, sent) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', sent);
    }, action);
  try {
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 260, { steps: 4 });
    await window.mouse.up();
    const outline = window.locator('[data-testid^="feature-row-"]').first();
    await outline.focus();
    await window.keyboard.press('F2');
    const field = window.getByTestId('row-name-input');
    await field.fill('Half-typed');

    await menu('undo');
    await expect(window.getByTestId('feature-count')).toHaveText('0');
    await expect(field).toHaveCount(0);
    await menu('redo');
    await expect(window.getByTestId('feature-count')).toHaveText('1');
    // Back as it was: no field reopened uninvited, nothing half-typed kept.
    await expect(outline).toHaveAccessibleName('Outline');
    await expect(field).toHaveCount(0);
    // And F2 still renames it, as one step.
    await outline.focus();
    await window.keyboard.press('F2');
    await field.fill('Edge');
    await window.keyboard.press('Enter');
    await expect(outline).toHaveAccessibleName('Edge');
    await expect(outline).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('a locked feature is reached from the tree by keyboard, and unlocked from its menu (F.2)', async () => {
  await withSample(async (window) => {
    await row(window, 'outer-outline').hover();
    await window.getByTestId('feature-locked-outer-outline').click();
    await expect(window.getByTestId('feature-locked-outer-outline')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await piece(window, 'outer').focus();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('feature-row-outer-outline')).toBeFocused();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await window.keyboard.press('Shift+F10');
    await expect(window.getByTestId('context-lock')).toHaveText(/Unlock/);
    await window.getByTestId('context-lock').focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('feature-locked-outer-outline')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

test('a selection on the board opens its piece and scrolls its row into view, leaving focus alone', async () => {
  const { app, window } = await openApp();
  try {
    await resizeWindow(app, window, 1440, 600);
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    // Six pieces, each with stitching: more rows than the panel holds.
    const corners = [100, 260, 420].flatMap((x) => [80, 240].map((y) => [x, y] as const));
    for (const [x, y] of corners) {
      await window.getByTestId('tool-rectangle').click();
      await window.mouse.move(box.x + x, box.y + y);
      await window.mouse.down();
      await window.mouse.move(box.x + x + 120, box.y + y + 100, { steps: 4 });
      await window.mouse.up();
      await window.getByTestId('add-stitch-line').click();
      await window.getByTestId('add-stitch-holes').click();
    }
    await expect(window.getByTestId('part-count')).toHaveText('6');

    // The first piece, closed, and the list scrolled to its end.
    const first = window.locator('[data-testid^="part-heading-"]').first();
    await first.locator('[data-testid^="part-fold-"]').click();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    const panel = window.getByTestId('parts-list');
    await panel.evaluate((element) => element.scrollTo(0, element.scrollHeight));

    // Picked on the board by its outline's left edge.
    await window.getByTestId('tool-select').click();
    await window.mouse.click(box.x + corners[0]![0], box.y + corners[0]![1] + 50);
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    const selected = panel.locator('[role="treeitem"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeInViewport();
    expect(await window.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe(
      'treeitem',
    );
  } finally {
    await closeApp(app);
  }
});

test('Design says only what does not print; the Sheets view says where each piece prints', async () => {
  await withSample(async (window) => {
    await expect(window.getByTestId('sheets-parts')).toHaveCount(0);
    await expect(window.locator('[data-testid^="part-not-printed-"]')).toHaveCount(0);

    // A hidden piece is left off the paper (Q20), and its row says so.
    await piece(window, 'pocket').hover();
    await window.getByTestId('part-visible-pocket').click();
    const mark = window.getByTestId('part-not-printed-pocket');
    await expect(mark).toBeVisible();
    await mark.hover();
    await expect(window.getByRole('tooltip')).toHaveText('Not printed. It is hidden.');
    await expect(piece(window, 'pocket')).toHaveAccessibleDescription(
      'Hidden. Not printed. It is hidden.',
    );

    await window.keyboard.press('Control+2');
    await expect(window.getByTestId('sheets-group-1')).toContainText('Outer');
    await expect(window.getByTestId('sheets-not-printed')).toContainText('It is hidden.');
    await expect(window.locator('[data-testid^="part-not-printed-"]')).toHaveCount(0);
  });
});

test('the tree has no accessibility violations, its pieces open or closed', async () => {
  await withSample(async (window) => {
    const scan = (what: string): Promise<void> => expectNoViolations(window, what);
    await piece(window, 'outer').focus();
    await scan('every piece open, a row focused');
    for (const id of ['outer', 'lining', 'pocket']) {
      await window.getByTestId(`part-fold-${id}`).click();
    }
    await scan('every piece closed');
    await window.keyboard.press('Control+2');
    await scan('on the Sheets view');
  });
});
