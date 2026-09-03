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
 * The interface grows as slices need it. Printer enumeration and print-job
 * submission arrive with slice 7.6; adding stubs for them now would only make
 * the fake lie.
 */

export type { PlatformHost, OpenDialogOptions, SaveDialogOptions, FileFilter } from './host.js';
export { InMemoryPlatformHost } from './fake.js';
