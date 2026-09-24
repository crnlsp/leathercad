import { contextBridge, ipcRenderer } from 'electron';

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

  getUserConfigDir: (): Promise<string> => ipcRenderer.invoke(IPC.getUserConfigDir),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getAppVersion),

  writeRecovery: (data: Uint8Array): Promise<void> => ipcRenderer.invoke(IPC.writeRecovery, data),

  clearRecovery: (): Promise<void> => ipcRenderer.invoke(IPC.clearRecovery),

  findRecovery: (): Promise<{ id: string; savedAt: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke(IPC.findRecovery),

  resolveRecovery: (id: string, how: 'adopt' | 'corrupt'): Promise<void> =>
    ipcRenderer.invoke(IPC.resolveRecovery, id, how),

  getRecoveryIntervalMs: (): Promise<number> => ipcRenderer.invoke(IPC.getRecoveryIntervalMs),

  onMenuAction: (listener: (action: string) => void): (() => void) => {
    const handler = (_event: unknown, action: string): void => listener(action);
    ipcRenderer.on(IPC.menuAction, handler);
    return () => ipcRenderer.removeListener(IPC.menuAction, handler);
  },
};

export type PlatformBridge = typeof platformBridge;

contextBridge.exposeInMainWorld('platform', platformBridge);
