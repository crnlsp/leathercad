import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import log from 'electron-log/main';

import { IPC } from '../shared/ipc.js';
import { writeFileAtomic } from './atomicWrite.js';
import type { PathGrants, PathUse } from './pathGrants.js';
import type { PreferencesStore } from './preferences.js';
import type { RecoveryStore } from './recovery.js';

/**
 * How often the renderer writes a recovery copy while there is unsaved work.
 * A minute, as `product-spec.md` §7 asks; E2E tests shorten it, since a crash
 * test cannot wait a minute for the copy it is about to recover.
 */
function recoveryIntervalMs(): number {
  const override = Number(process.env['LEATHERCAD_RECOVERY_INTERVAL_MS']);
  return Number.isFinite(override) && override > 0 ? override : 60_000;
}

/**
 * Implements PlatformHost in the main process. The renderer reaches these
 * through the preload bridge; it has no direct filesystem access.
 *
 * Nor does it get one through here: it reads, writes and opens only the paths
 * the user chose in these dialogs this session (`PathGrants`), or chose from
 * *File › Open Recent*, whose list only ever holds such paths.
 */
export function registerPlatformHandlers(
  getWindow: () => BrowserWindow | null,
  recovery: RecoveryStore,
  grants: PathGrants,
  preferences: PreferencesStore,
  /** The recent list changed, so the menu showing it has to be rebuilt. */
  onRecentChanged: (path: string) => void,
): void {
  ipcMain.handle(IPC.readFile, async (_event, path: unknown) => {
    const buffer = await readFile(guard(grants, path, 'read'));
    return new Uint8Array(buffer);
  });

  ipcMain.handle(IPC.writeFile, async (_event, path: unknown, data: Uint8Array) => {
    await writeFileAtomic(guard(grants, path, 'write'), data);
  });

  ipcMain.handle(IPC.showOpenDialog, async (_event, options: Electron.OpenDialogOptions) => {
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: ['openFile'] })
      : await dialog.showOpenDialog({ ...options, properties: ['openFile'] });
    const chosen = result.canceled ? null : (result.filePaths[0] ?? null);
    if (chosen !== null) grants.grant(chosen);
    return chosen;
  });

  ipcMain.handle(IPC.showSaveDialog, async (_event, options: Electron.SaveDialogOptions) => {
    const window = getWindow();
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    const chosen = result.canceled ? null : (result.filePath ?? null);
    if (chosen !== null) {
      grants.grant(
        chosen,
        (options.filters ?? []).flatMap((filter) => filter.extensions),
      );
    }
    return chosen;
  });

  ipcMain.handle(IPC.openInExternalViewer, async (_event, path: unknown) => {
    const error = await shell.openPath(guard(grants, path, 'view'));
    if (error !== '') throw new Error(error);
  });

  ipcMain.handle(IPC.getUserConfigDir, () => join(app.getPath('userData')));

  ipcMain.handle(IPC.getAppVersion, () => app.getVersion());

  // Crash recovery (5.3b). The renderer says what to keep; the files — their
  // names, their directory, their atomic writes — are the main process's alone.
  ipcMain.handle(IPC.writeRecovery, async (_event, data: Uint8Array) => {
    await recovery.write(data);
  });
  ipcMain.handle(IPC.clearRecovery, async () => {
    await recovery.clear();
  });
  ipcMain.handle(IPC.findRecovery, () => recovery.findAbandoned());
  ipcMain.handle(IPC.resolveRecovery, async (_event, id: string, how: 'adopt' | 'corrupt') => {
    if (how === 'corrupt') {
      log.warn(`recovery copy ${id} did not load; set aside as ${id}.lcp.corrupt`);
      await recovery.markCorrupt(id);
    } else {
      await recovery.adopt(id);
    }
  });
  ipcMain.handle(IPC.getRecoveryIntervalMs, () => recoveryIntervalMs());

  // Preferences (8.2). The renderer names a change, never the file.
  ipcMain.handle(IPC.getPreferences, () => preferences.preferences);
  ipcMain.handle(IPC.setPreferences, async (_event, changes: unknown) => {
    await preferences.update(changes);
  });
  // Only a project the maker chose in a dialog this session joins the list,
  // so *Open Recent* can never become a way to reach any other file.
  ipcMain.handle(IPC.noteRecentFile, async (_event, path: unknown) => {
    if (!grants.allows(path, 'write')) return;
    await preferences.noteRecent(path as string);
    onRecentChanged(path as string);
  });
}

/** The path, if the renderer may use it this way; otherwise logged and refused. */
function guard(grants: PathGrants, path: unknown, use: PathUse): string {
  try {
    return grants.check(path, use);
  } catch (error) {
    const shown = typeof path === 'string' ? JSON.stringify(path) : `a ${typeof path}`;
    log.warn(`refused to ${use} ${shown}: not chosen in a dialog this session`);
    throw error;
  }
}
