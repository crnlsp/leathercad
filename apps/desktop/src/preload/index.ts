import type { Preferences } from '@leathercad/platform';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

import { IPC } from '../shared/ipc.js';

/**
 * The entire surface the renderer gets. Shape matches PlatformHost from
 * @leathercad/platform; the renderer adapts it in platformBridge.ts.
 *
 * Nothing else crosses the isolation boundary — no `require`, no `process`,
 * no filesystem.
 */
const platformBridge = {
  readFile: (path: string): Promise<Uint8Array> => ipcRenderer.invoke(IPC.readFile, path),

  writeFile: (path: string, data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke(IPC.writeFile, path, data),

  showOpenDialog: (options: unknown): Promise<string | null> =>
    ipcRenderer.invoke(IPC.showOpenDialog, options),

  showSaveDialog: (options: unknown): Promise<string | null> =>
    ipcRenderer.invoke(IPC.showSaveDialog, options),

  openInExternalViewer: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC.openInExternalViewer, path),

  listPrinters: (): Promise<unknown> => ipcRenderer.invoke(IPC.listPrinters),

  printPdf: (data: Uint8Array, job: unknown): Promise<string> =>
    ipcRenderer.invoke(IPC.printPdf, data, job),

  getUserConfigDir: (): Promise<string> => ipcRenderer.invoke(IPC.getUserConfigDir),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getAppVersion),

  setDocumentEdited: (edited: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.setDocumentEdited, edited),

  setKeyCapture: (capturing: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.setKeyCapture, capturing),

  writeRecovery: (tab: string, data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke(IPC.writeRecovery, tab, data),

  clearRecovery: (tab: string): Promise<void> => ipcRenderer.invoke(IPC.clearRecovery, tab),

  findRecovery: (): Promise<{ id: string; savedAt: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke(IPC.findRecovery),

  resolveRecovery: (id: string, how: 'adopt' | 'corrupt'): Promise<void> =>
    ipcRenderer.invoke(IPC.resolveRecovery, id, how),

  getRecoveryIntervalMs: (): Promise<number> => ipcRenderer.invoke(IPC.getRecoveryIntervalMs),

  getPreferences: (): Promise<Preferences> => ipcRenderer.invoke(IPC.getPreferences),

  setPreferences: (changes: unknown): Promise<void> =>
    ipcRenderer.invoke(IPC.setPreferences, changes),

  getSystemLanguages: (): Promise<string[]> => ipcRenderer.invoke(IPC.getSystemLanguages),

  noteRecentFile: (path: string): Promise<void> => ipcRenderer.invoke(IPC.noteRecentFile, path),

  getRecentFiles: (): Promise<{ path: string; shown: string; pinned: boolean }[]> =>
    ipcRenderer.invoke(IPC.getRecentFiles),

  openRecent: (path: string): Promise<'opening' | 'gone' | 'unlisted'> =>
    ipcRenderer.invoke(IPC.openRecent, path),

  clearRecent: (): Promise<void> => ipcRenderer.invoke(IPC.clearRecent),

  pinRecent: (path: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.pinRecent, path, pinned),

  removeRecent: (path: string): Promise<void> => ipcRenderer.invoke(IPC.removeRecent, path),
  showLogFolder: (): Promise<void> => ipcRenderer.invoke(IPC.showLogFolder),

  readNotices: (): Promise<string | null> => ipcRenderer.invoke(IPC.readNotices),

  getUpdateStatus: (): Promise<unknown> => ipcRenderer.invoke(IPC.getUpdateStatus),

  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke(IPC.checkForUpdates),

  readSampleProject: (): Promise<Uint8Array> => ipcRenderer.invoke(IPC.readSampleProject),

  takeLaunchFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.takeLaunchFile),

  takeSession: (): Promise<unknown> => ipcRenderer.invoke(IPC.takeSession),

  keepSession: (session: unknown): Promise<void> => ipcRenderer.invoke(IPC.keepSession, session),

  keepUnsaved: (tab: string, data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke(IPC.keepUnsaved, tab, data),

  renameProjectFile: (
    path: string,
    name: string,
  ): Promise<
    | { kind: 'renamed' | 'unchanged'; path: string }
    | { kind: 'exists'; file: string }
    | { kind: 'invalid' }
  > => ipcRenderer.invoke(IPC.renameProjectFile, path, name),

  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke(IPC.showInFolder, path),

  trashProjectFile: (path: string): Promise<void> => ipcRenderer.invoke(IPC.trashProjectFile, path),

  // A file dropped on the window (8.12): its path, which a sandboxed page
  // cannot read off the File itself. Empty for anything that is not a file.
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  listTemplates: (): Promise<unknown> => ipcRenderer.invoke(IPC.listTemplates),

  readTemplate: (id: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke(IPC.readTemplate, id),

  saveTemplate: (name: string, data: Uint8Array, replace: boolean): Promise<unknown> =>
    ipcRenderer.invoke(IPC.saveTemplate, name, data, replace),

  removeTemplate: (id: string): Promise<void> => ipcRenderer.invoke(IPC.removeTemplate, id),

  openDropped: (paths: readonly string[]): Promise<string[]> =>
    ipcRenderer.invoke(IPC.openDropped, paths),

  watchProjects: (paths: readonly string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.watchProjects, paths),

  onProjectChanged: (
    listener: (path: string, change: 'changed' | 'gone') => void,
  ): (() => void) => {
    const handler = (_event: unknown, path: string, change: 'changed' | 'gone'): void =>
      listener(path, change);
    ipcRenderer.on(IPC.projectChanged, handler);
    return () => ipcRenderer.removeListener(IPC.projectChanged, handler);
  },

  onOpenFile: (listener: (path: string) => void): (() => void) => {
    const handler = (_event: unknown, path: string): void => listener(path);
    ipcRenderer.on(IPC.openFile, handler);
    return () => ipcRenderer.removeListener(IPC.openFile, handler);
  },

  onMenuAction: (listener: (action: string) => void): (() => void) => {
    const handler = (_event: unknown, action: string): void => listener(action);
    ipcRenderer.on(IPC.menuAction, handler);
    return () => ipcRenderer.removeListener(IPC.menuAction, handler);
  },
};

export type PlatformBridge = typeof platformBridge;

contextBridge.exposeInMainWorld('platform', platformBridge);
