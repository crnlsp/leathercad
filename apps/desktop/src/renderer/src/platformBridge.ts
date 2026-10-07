import type {
  MenuAction,
  OpenDialogOptions,
  PlatformHost,
  Preferences,
  PrintJob,
  PrinterList,
  RecentFile,
  RecoveredCopy,
  SaveDialogOptions,
} from '@leathercad/platform';

/**
 * Adapts the preload bridge to the PlatformHost interface.
 *
 * The rest of the renderer depends on PlatformHost, never on `window.platform`,
 * so it can be handed InMemoryPlatformHost in tests without Electron present.
 */
interface PreloadBridge {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  showOpenDialog(options: OpenDialogOptions): Promise<string | null>;
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  openInExternalViewer(path: string): Promise<void>;
  listPrinters(): Promise<PrinterList>;
  printPdf(data: Uint8Array, job: PrintJob): Promise<string>;
  getUserConfigDir(): Promise<string>;
  getAppVersion(): Promise<string>;
  writeRecovery(data: Uint8Array): Promise<void>;
  clearRecovery(): Promise<void>;
  findRecovery(): Promise<RecoveredCopy | null>;
  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void>;
  getRecoveryIntervalMs(): Promise<number>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  getPreferences(): Promise<Preferences>;
  setPreferences(changes: Partial<Preferences>): Promise<void>;
  getSystemLanguages(): Promise<readonly string[]>;
  noteRecentFile(path: string): Promise<void>;
  getRecentFiles(): Promise<readonly RecentFile[]>;
  openRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;
  showLogFolder(): Promise<void>;
  openNotices(): Promise<void>;
  onOpenFile(listener: (path: string) => void): () => void;
  readSampleProject(): Promise<Uint8Array>;
  takeLaunchFile(): Promise<string | null>;
}

declare global {
  interface Window {
    platform?: PreloadBridge;
  }
}

export function getPlatformHost(): PlatformHost {
  const bridge = window.platform;
  if (bridge === undefined) {
    throw new Error(
      'Preload bridge missing. The renderer was loaded without the preload script — ' +
        'check webPreferences.preload in src/main/index.ts.',
    );
  }
  return bridge;
}
