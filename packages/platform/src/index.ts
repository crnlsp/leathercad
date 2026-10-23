/**
 * @leathercad/platform — the operating-system boundary.
 *
 * This is the ONLY way application code touches the OS. Everything above the
 * editor layer depends on this interface; nothing depends on Electron except
 * apps/desktop, which supplies the implementation.
 *
 * That is what keeps the shell replaceable: swapping Electron for Tauri means
 * writing another PlatformHost, not rewriting the app. See ADR 0002 and
 * docs/architecture.md §5.
 *
 * The interface grows as slices need it.
 */

export type {
  KeptSession,
  OpenSessionTab,
  TabCamera,
  OutsideChange,
  FileRename,
  OpenSession,
  PlatformHost,
  OpenDialogOptions,
  SaveDialogOptions,
  FileFilter,
  Iron,
  MenuAction,
  Preferences,
  PrintJob,
  Printer,
  PrinterList,
  RecentFile,
  RecentOutcome,
  RecoveredCopy,
  UpdateAnswer,
  UpdateStatus,
} from './host.js';
export { DEFAULT_PREFERENCES, STARTER_IRONS } from './host.js';
export { systemIdSource } from './systemIdSource.js';
