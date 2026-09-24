import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 5.3b: crash recovery.
 *
 * The app is really killed (SIGKILL — no unload, no quit handlers), in a state
 * directory of its own, with the recovery interval shortened from a minute so
 * a test can wait for a copy. Nothing here touches the real
 * ~/.local/state/leathercad.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

async function launch(state: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_STATE_HOME: state, LEATHERCAD_RECOVERY_INTERVAL_MS: '250' },
  });
  const window = await app.firstWindow();
  // See unsaved-changes.spec.ts: a refused unload reports a phantom dialog.
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

const recoveryDir = (state: string): string => join(state, 'leathercad', 'recovery');
const entries = (state: string): string[] =>
  existsSync(recoveryDir(state)) ? readdirSync(recoveryDir(state)).sort() : [];
const copies = (state: string): string[] => entries(state).filter((n) => n.endsWith('.lcp'));

/** A crash: the process is killed outright, so nothing of a clean exit runs. */
async function crash(app: ElectronApplication): Promise<void> {
  const process = app.process();
  await new Promise<void>((done) => {
    process.once('exit', () => done());
    process.kill('SIGKILL');
  });
}

async function drawAPanel(window: Page, at: number): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + at, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + at + 120, box.y + 250, { steps: 5 });
  await window.mouse.up();
}

let state: string;
test.beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'leathercad-e2e-state-'));
});
test.afterEach(() => {
  rmSync(state, { recursive: true, force: true });
});

test('a crash with unsaved work is offered back, untitled and unsaved, and its file is untouched', async () => {
  const project = join(state, 'card-holder.lcp');
  const first = await launch(state);
  await first.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, project);
  await drawAPanel(first.window, 150);
  await first.window.getByTestId('save').click();
  await expect(first.window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
  const saved = readFileSync(project);

  // Unsaved work, then a copy of it, then the crash.
  await drawAPanel(first.window, 350);
  await expect(first.window.getByTestId('part-count')).toHaveText('2');
  await expect.poll(() => copies(state).length).toBe(1);
  await crash(first.app);

  const second = await launch(state);
  try {
    const dialog = second.window.getByTestId('recovery-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('did not close properly');
    await expect(dialog.getByTestId('recovery-recover')).toBeFocused();
    await dialog.getByTestId('recovery-recover').click();

    // Back, as it was — and untitled and unsaved, not the file it came from.
    await expect(second.window.getByTestId('part-count')).toHaveText('2');
    await expect(second.window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await expect(second.window.getByTestId('status-bar')).not.toContainText(basename(project));
    expect(readFileSync(project).equals(saved)).toBe(true);

    // Saving asks where, and the original is still never written.
    const elsewhere = join(state, 'recovered.lcp');
    await second.app.evaluate(({ dialog: native }, path) => {
      native.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, elsewhere);
    await second.window.getByTestId('save').click();
    await expect(second.window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
    expect(existsSync(elsewhere)).toBe(true);
    expect(readFileSync(project).equals(saved)).toBe(true);
  } finally {
    await closeApp(second.app);
  }
  // A clean exit leaves nothing behind.
  expect(copies(state)).toEqual([]);
});

test('Not now keeps the copy until the next clean exit', async () => {
  const first = await launch(state);
  await drawAPanel(first.window, 150);
  await expect.poll(() => copies(state).length).toBe(1);
  await crash(first.app);
  const crashed = copies(state);

  const second = await launch(state);
  await second.window.getByTestId('recovery-decline').click();
  await expect(second.window.getByTestId('recovery-dialog')).toHaveCount(0);
  await expect(second.window.getByTestId('part-count')).toHaveText('0');
  // Declining is not deleting.
  expect(copies(state)).toEqual(crashed);

  await closeApp(second.app);
  expect(copies(state)).toEqual([]);
});

test('a copy is kept only while there is unsaved work', async () => {
  const project = join(state, 'panel.lcp');
  const { app, window } = await launch(state);
  try {
    await expect(window.getByTestId('recovery-dialog')).toHaveCount(0);
    await drawAPanel(window, 150);
    await expect.poll(() => copies(state).length).toBe(1);

    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await window.getByTestId('save').click();
    await expect.poll(() => copies(state)).toEqual([]);
  } finally {
    await closeApp(app);
  }
});

test('a damaged copy is set aside, and startup carries on', async () => {
  mkdirSync(recoveryDir(state), { recursive: true });
  // A dead session's copy that is not a project, and the scrap of a write the
  // crash interrupted.
  writeFileSync(join(recoveryDir(state), '999999-1.lcp'), 'not a zip archive');
  writeFileSync(join(recoveryDir(state), '999999-1.lcp.0a1b2c.tmp'), 'half');

  const { app, window } = await launch(state);
  try {
    await expect.poll(() => entries(state)).toEqual(['999999-1.lcp.corrupt']);
    await expect(window.getByTestId('recovery-dialog')).toHaveCount(0);
    await drawAPanel(window, 150);
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('a crashed window keeps its copy through the quit that follows', async () => {
  // The renderer dies but the app lives on to a normal quit — which must not
  // delete the one copy of the work the renderer took with it.
  const first = await launch(state);
  await drawAPanel(first.window, 150);
  await expect.poll(() => copies(state).length).toBe(1);
  await first.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
  );
  // The crash reaches the main process as an event; a maker quits after it.
  await expect
    .poll(() =>
      first.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.isCrashed(),
      ),
    )
    .toBe(true);
  await closeApp(first.app);
  expect(copies(state)).toHaveLength(1);

  const second = await launch(state);
  try {
    await expect(second.window.getByTestId('recovery-dialog')).toBeVisible();
  } finally {
    await closeApp(second.app);
  }
});
