import type {
  OpenDialogOptions,
  PlatformHost,
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
  getUserConfigDir(): Promise<string>;
  getAppVersion(): Promise<string>;
  writeRecovery(data: Uint8Array): Promise<void>;
  clearRecovery(): Promise<void>;
  findRecovery(): Promise<RecoveredCopy | null>;
  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void>;
  getRecoveryIntervalMs(): Promise<number>;
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
