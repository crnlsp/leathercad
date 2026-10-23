import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { OpenSession, RecentOutcome } from '@leathercad/platform';
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import log from 'electron-log/main';

import { IPC } from '../shared/ipc.js';
import { writeFileAtomic } from './atomicWrite.js';
import { stateDirectory } from './diagnostics.js';
import type { PathGrants, PathUse } from './pathGrants.js';
import { OneAtATime } from './oneAtATime.js';
import type { KeptCopies } from './keptCopies.js';
import type { Templates } from './templates.js';
import type { ProjectWatch } from './projectWatch.js';
import { listPrinters, printPdf, runCommand } from './printing.js';
import { renameProjectFile } from './renameFile.js';
import { isProjectPath, readSession, shownPath, type PreferencesStore } from './preferences.js';
import type { RecoveryStore } from './recovery.js';
import type { UpdateChecker } from './updates.js';

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
 * the recent projects, whose list only ever holds such paths.
 */
export function registerPlatformHandlers(
  getWindow: () => BrowserWindow | null,
  recovery: RecoveryStore,
  grants: PathGrants,
  preferences: PreferencesStore,
  /** A project joined the recent list: the operating system's list is told too. */
  onRecentChanged: (path: string) => void,
  /** The project this launch names, already granted (8.5); handed over once. */
  takeLaunchFile: () => string | null,
  /** The tabs open when the app last closed, their files granted (8.12); handed over once. */
  takeSession: () => Promise<OpenSession>,
  /** Opens a project from the recent list, if it is on it (8.7). */
  openRecent: (path: string) => Promise<RecentOutcome>,
  /** The third-party notices the build wrote (8.6b), or null in development (U.20). */
  readNotices: () => Promise<string | null>,
  /** The preferences changed: the main process's own words may be in another language now. */
  onPreferencesChanged: () => void,
  /** Settings is listening for a key (U.12): the window's own keys wait. */
  onKeyCapture: (capturing: boolean) => void,
  /** Whether a newer release exists (8.9): the start's answer, or *Check now*. */
  updates: UpdateChecker,
  /** The open projects' files, watched for changes made outside the app (8.12). */
  projectWatch: ProjectWatch,
  /** Unsaved work kept as the window closes, for the next start (8.12). */
  kept: KeptCopies,
  /** The project templates: the built-in ones and the maker's own (8.12). */
  templates: Templates,
): void {
  ipcMain.handle(IPC.readFile, async (_event, path: unknown) => {
    const buffer = await readFile(guard(grants, path, 'read'));
    return new Uint8Array(buffer);
  });

  ipcMain.handle(IPC.writeFile, async (_event, path: unknown, data: Uint8Array) => {
    const target = guard(grants, path, 'write');
    await writeFileAtomic(target, data);
    // The app's own write is not a change made outside it (8.12).
    await projectWatch.saw(target);
  });

  // Projects dropped on the window (8.12). A drop is the maker choosing a file,
  // as a dialog is, but the main process cannot see it happen: it takes the
  // renderer's word for the path. So only a `.lcp` that exists is granted —
  // never another kind of file — and each is logged. SECURITY.md says so.
  ipcMain.handle(IPC.openDropped, (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return [];
    const granted: string[] = [];
    for (const path of paths.slice(0, 20)) {
      if (!isProjectPath(path) || !existsSync(path)) continue;
      grants.grant(path);
      granted.push(path);
      log.info(`granted a dropped project: ${JSON.stringify(path)}`);
    }
    return granted;
  });

  // Templates (8.12). The renderer names one by its id, never by a path, and
  // names one it saves by a name that is checked as a file name.
  ipcMain.handle(IPC.listTemplates, () => templates.list());
  ipcMain.handle(IPC.readTemplate, (_event, id: unknown) =>
    typeof id === 'string' ? templates.read(id) : null,
  );
  ipcMain.handle(IPC.saveTemplate, (_event, name: unknown, data: Uint8Array, replace: unknown) =>
    typeof name === 'string' ? templates.save(name, data, replace === true) : { kind: 'invalid' },
  );
  ipcMain.handle(IPC.removeTemplate, async (_event, id: unknown) => {
    if (typeof id === 'string') await templates.remove(id);
  });

  // The open projects' files (8.12), watched from now on: only paths the
  // renderer may read, so a watch can never be a way to learn of any other.
  ipcMain.handle(IPC.watchProjects, async (_event, paths: unknown) => {
    const allowed = Array.isArray(paths) ? paths.filter((path) => grants.allows(path, 'read')) : [];
    await projectWatch.watch(allowed as string[]);
  });

  // One file dialog at a time (8.12). A second Ctrl+O, or *Open…* chosen
  // again while the first dialog is up — which a Linux file chooser does not
  // stop, as it is not modal to the window everywhere — is answered as
  // cancelled, rather than opening a second dialog whose answer would race the
  // first's.
  const oneDialog = new OneAtATime();

  ipcMain.handle(IPC.showOpenDialog, (_event, options: Electron.OpenDialogOptions) =>
    oneDialog.run(null, async () => {
      const window = getWindow();
      const result = window
        ? await dialog.showOpenDialog(window, { ...options, properties: ['openFile'] })
        : await dialog.showOpenDialog({ ...options, properties: ['openFile'] });
      const chosen = result.canceled ? null : (result.filePaths[0] ?? null);
      if (chosen !== null) grants.grant(chosen);
      return chosen;
    }),
  );

  ipcMain.handle(IPC.showSaveDialog, (_event, options: Electron.SaveDialogOptions) =>
    oneDialog.run(null, () => saveDialog(options)),
  );

  async function saveDialog(options: Electron.SaveDialogOptions): Promise<string | null> {
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
  }

  ipcMain.handle(IPC.openInExternalViewer, async (_event, path: unknown) => {
    const error = await shell.openPath(guard(grants, path, 'view'));
    if (error !== '') throw new Error(error);
  });

  // Printing (7.6): the system's CUPS client, scaling off. The renderer sends
  // the bytes it previewed and a job; the printer, the pages and the copies
  // are checked here before anything runs.
  ipcMain.handle(IPC.listPrinters, () => listPrinters(runCommand));
  ipcMain.handle(IPC.printPdf, async (_event, data: unknown, job: unknown) => {
    try {
      const id = await printPdf(runCommand, data, job);
      log.info(`printed ${JSON.stringify(job)} as job ${id}`);
      return id;
    } catch (error) {
      log.warn(`print refused: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  ipcMain.handle(IPC.getUserConfigDir, () => join(app.getPath('userData')));

  ipcMain.handle(IPC.getAppVersion, () => app.getVersion());

  // The edited flag (U.7): macOS's dot in the close button. A no-op elsewhere.
  ipcMain.handle(IPC.setDocumentEdited, (_event, edited: unknown) => {
    getWindow()?.setDocumentEdited(edited === true);
  });

  ipcMain.handle(IPC.setKeyCapture, (_event, capturing: unknown) => {
    onKeyCapture(capturing === true);
  });

  // Crash recovery (5.3b). The renderer says what to keep; the files — their
  // names, their directory, their atomic writes — are the main process's alone.
  ipcMain.handle(IPC.writeRecovery, async (_event, tab: unknown, data: Uint8Array) => {
    // The tab's id names the copy; the store refuses anything but a ULID.
    await recovery.write(String(tab), data);
  });
  ipcMain.handle(IPC.clearRecovery, async (_event, tab: unknown) => {
    await recovery.clear(String(tab));
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

  ipcMain.handle(IPC.takeLaunchFile, () => takeLaunchFile());

  // The open tabs (8.12), kept for the next start. Only a project the maker
  // chose this session is kept — as for the recent list — so the session can
  // never become a way to reach any other file at the next start.
  ipcMain.handle(IPC.takeSession, () => takeSession());

  // A project renamed renames its file (8.12): only one the renderer may
  // write, in its own folder, never over another file. The new name is the
  // maker's as much as the old, so it is granted, and the recent list follows.
  ipcMain.handle(IPC.renameProjectFile, async (_event, path: unknown, name: unknown) => {
    const from = guard(grants, path, 'write');
    if (typeof name !== 'string') return { kind: 'invalid' };
    const outcome = await renameProjectFile(from, name);
    if (outcome.kind === 'renamed') {
      grants.grant(outcome.path);
      if (preferences.lists(from)) {
        const pinned = preferences.pinnedFiles.includes(from);
        await preferences.forgetRecent(from);
        await preferences.noteRecent(outcome.path);
        if (pinned) await preferences.pin(outcome.path, true);
        onRecentChanged(outcome.path);
      }
      log.info(`renamed a project file to ${JSON.stringify(outcome.path)}`);
    }
    return outcome;
  });

  // A tab's menu (8.12): its file shown in the file manager, or moved to the
  // Trash — the system's, from which it can be restored. Only a project the
  // renderer may write, and only a project file.
  ipcMain.handle(IPC.showInFolder, (_event, path: unknown) => {
    shell.showItemInFolder(guard(grants, path, 'read'));
  });
  ipcMain.handle(IPC.trashProjectFile, async (_event, path: unknown) => {
    const target = guard(grants, path, 'write');
    if (!isProjectPath(target)) throw new Error('Only a project file is moved to the Trash.');
    await shell.trashItem(target);
    await preferences.forgetRecent(target);
    log.info(`moved a project file to the Trash: ${JSON.stringify(target)}`);
  });
  ipcMain.handle(IPC.keepSession, async (_event, session: unknown) => {
    const read = readSession(session);
    // A path only if the maker chose it; a kept copy only if written now.
    const tabs = read.tabs
      .map((tab, index) => ({
        index,
        tab: {
          ...tab,
          path: grants.allows(tab.path, 'write') ? tab.path : null,
          kept: tab.kept !== null && kept.wrote(tab.kept) ? tab.kept : null,
        },
      }))
      .filter(({ tab }) => tab.path !== null || tab.kept !== null);
    const active = tabs.findIndex(({ index }) => index === read.active);
    await preferences.keepSession({
      tabs: tabs.map(({ tab }) => tab),
      active: active === -1 ? null : active,
    });
  });
  ipcMain.handle(IPC.keepUnsaved, async (_event, tab: unknown, data: Uint8Array) => {
    await kept.write(String(tab), data);
  });

  // Preferences (8.2). The renderer names a change, never the file.
  ipcMain.handle(IPC.getPreferences, () => preferences.preferences);
  ipcMain.handle(IPC.setPreferences, async (_event, changes: unknown) => {
    const written = preferences.update(changes);
    onPreferencesChanged();
    await written;
  });
  ipcMain.handle(IPC.getSystemLanguages, () => app.getPreferredSystemLanguages());
  // Only a project the maker chose in a dialog this session joins the list,
  // so the recent projects can never become a way to reach any other file.
  ipcMain.handle(IPC.noteRecentFile, async (_event, path: unknown) => {
    if (!grants.allows(path, 'write')) return;
    await preferences.noteRecent(path as string);
    onRecentChanged(path as string);
  });

  // The recent list as the Project menu shows it (8.7). A path is only
  // opened because it is on this list — `openRecent` checks — so the
  // renderer cannot name its way to any other file.
  ipcMain.handle(IPC.getRecentFiles, () =>
    // The pinned first, in the order pinned (8.12), then the recent ones.
    [
      ...preferences.pinnedFiles.map((path) => ({ path, pinned: true })),
      ...preferences.recentFiles.map((path) => ({ path, pinned: false })),
    ].map((entry) => ({ ...entry, shown: shownPath(entry.path, app.getPath('home')) })),
  );
  ipcMain.handle(IPC.openRecent, (_event, path: unknown) =>
    typeof path === 'string' ? openRecent(path) : 'unlisted',
  );
  // Pinning and removing one at a time (8.12): only a path on the list.
  ipcMain.handle(IPC.pinRecent, async (_event, path: unknown, pinned: unknown) => {
    if (typeof path === 'string') await preferences.pin(path, pinned === true);
  });
  ipcMain.handle(IPC.removeRecent, async (_event, path: unknown) => {
    if (typeof path === 'string') await preferences.forgetRecent(path);
  });
  ipcMain.handle(IPC.clearRecent, async () => {
    await preferences.clearRecent();
    app.clearRecentDocuments();
  });
  ipcMain.handle(IPC.showLogFolder, async () => {
    await shell.openPath(stateDirectory());
  });
  ipcMain.handle(IPC.readNotices, () => readNotices());

  // The update check (8.9): the main process asks, the renderer only hears
  // the answer, so its Content-Security-Policy still connects to nothing.
  ipcMain.handle(IPC.getUpdateStatus, () => updates.status());
  ipcMain.handle(IPC.checkForUpdates, async () => {
    const status = await updates.check();
    log.info(`update check, asked for: ${status.state}`);
    return status;
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
