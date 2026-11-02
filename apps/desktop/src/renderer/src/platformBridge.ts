import type { ScaleCorrection } from '@leathercad/core';
import type {
  MenuAction,
  FileRename,
  TemplateEntry,
  TemplateSave,
  KeptSession,
  OpenDialogOptions,
  OpenSession,
  OutsideChange,
  PlatformHost,
  Preferences,
  PrintJob,
  PrinterList,
  RecentFile,
  RecentOutcome,
  RecoveredCopy,
  SaveDialogOptions,
  UpdateStatus,
} from '@leathercad/platform';

/**
 * Adapts the preload bridge to the PlatformHost interface.
 *
 * The rest of the renderer depends on PlatformHost, never on `window.platform`,
 * so nothing but this file knows how the preload exposes it.
 */
interface PreloadBridge {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  showOpenDialog(options: OpenDialogOptions): Promise<string | null>;
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  openInExternalViewer(path: string): Promise<void>;
  listPrinters(): Promise<PrinterList>;
  printPdf(data: Uint8Array, job: PrintJob): Promise<string>;
  getPrinterCorrection(printer: string): Promise<ScaleCorrection>;
  setPrinterCorrection(printer: string, correction: ScaleCorrection | null): Promise<void>;
  getUserConfigDir(): Promise<string>;
  getAppVersion(): Promise<string>;
  setDocumentEdited(edited: boolean): Promise<void>;
  setKeyCapture(capturing: boolean): Promise<void>;
  writeRecovery(tab: string, data: Uint8Array): Promise<void>;
  clearRecovery(tab: string): Promise<void>;
  findRecovery(): Promise<RecoveredCopy | null>;
  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void>;
  getRecoveryIntervalMs(): Promise<number>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  getPreferences(): Promise<Preferences>;
  setPreferences(changes: Partial<Preferences>): Promise<void>;
  getSystemLanguages(): Promise<readonly string[]>;
  noteRecentFile(path: string): Promise<void>;
  getRecentFiles(): Promise<readonly RecentFile[]>;
  openRecent(path: string): Promise<RecentOutcome>;
  clearRecent(): Promise<void>;
  pinRecent(path: string, pinned: boolean): Promise<void>;
  removeRecent(path: string): Promise<void>;
  showLogFolder(): Promise<void>;
  readNotices(): Promise<string | null>;
  onOpenFile(listener: (path: string) => void): () => void;
  takeLaunchFile(): Promise<string | null>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  takeSession(): Promise<OpenSession>;
  keepSession(session: KeptSession): Promise<void>;
  keepUnsaved(tab: string, data: Uint8Array): Promise<void>;
  renameProjectFile(path: string, name: string): Promise<FileRename>;
  showInFolder(path: string): Promise<void>;
  trashProjectFile(path: string): Promise<void>;
  watchProjects(paths: readonly string[]): Promise<void>;
  pathForFile(file: unknown): string;
  openDropped(paths: readonly string[]): Promise<readonly string[]>;
  listTemplates(): Promise<readonly TemplateEntry[]>;
  readTemplate(id: string): Promise<Uint8Array | null>;
  saveTemplate(name: string, data: Uint8Array, replace: boolean): Promise<TemplateSave>;
  removeTemplate(id: string): Promise<void>;
  renameTemplate(id: string, name: string): Promise<TemplateSave>;
  duplicateTemplate(id: string, name: string): Promise<TemplateSave>;
  describeTemplate(id: string, description: string, tags: readonly string[]): Promise<void>;
  pinTemplate(id: string, pinned: boolean): Promise<void>;
  templateUsed(id: string): Promise<void>;
  importTemplate(options: OpenDialogOptions): Promise<TemplateSave | null>;
  exportTemplate(id: string, options: SaveDialogOptions): Promise<boolean>;
  editTemplate(id: string): Promise<string | null>;
  showTemplate(id: string): Promise<void>;
  onProjectChanged(listener: (path: string, change: OutsideChange) => void): () => void;
}

declare global {
  interface Window {
    platform?: PreloadBridge;
  }
}

/**
 * What the main process said when it refused — CUPS's own words, or why a
 * correction was not stored — without Electron's wrapping of a rejected call.
 */
export function refusalOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
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
