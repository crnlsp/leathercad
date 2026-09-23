import { join } from 'node:path';

import { app, crashReporter, type BrowserWindow } from 'electron';
import log from 'electron-log/main';

/**
 * What the app leaves behind when it fails on someone else's machine: a log
 * and, for a native crash, a minidump. Both stay on the machine. Nothing is
 * uploaded, and nothing here shows the user anything. See ADR 0015.
 *
 * This is not a second problem channel. What is wrong with a *pattern* is a
 * `Problem`, and it reaches the user through `diagnose()` (slice 4.12a). This
 * records what went wrong with the *app*, for whoever is asked to fix it.
 *
 * Both live in the XDG state directory, `~/.local/state/leathercad/`: logs
 * and crash dumps are neither configuration nor data. See docs/file-format.md
 * §6.
 */
export function startDiagnostics(): void {
  const state = stateDirectory();

  // Before `ready`, or the crash handler misses the start-up.
  app.setPath('crashDumps', join(state, 'crashes'));
  crashReporter.start({ uploadToServer: false });

  log.transports.file.resolvePathFn = () => join(state, 'logs', 'main.log');
  // One megabyte, then it rolls over to main.old.log: a bounded footprint,
  // with the previous session still there when someone reports a problem.
  log.transports.file.maxSize = 1024 * 1024;
  // The terminal only matters in development, and only for trouble.
  log.transports.console.level = app.isPackaged ? false : 'warn';

  log.info(
    `LeatherCAD ${app.getVersion()} starting — Electron ${process.versions.electron}, ` +
      `${process.platform} ${process.arch}`,
  );

  // A monitor, not a handler: it records the exception and leaves Electron's
  // own behaviour — the error dialog, then exit — exactly as it was.
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    log.error(`main process ${origin}:`, error);
  });

  app.on('render-process-gone', (_event, _contents, details) => {
    log.error('renderer process gone:', details);
  });
  app.on('child-process-gone', (_event, details) => {
    log.error('child process gone:', details);
  });
}

/** Renderer errors and warnings, which otherwise vanish with the window. */
export function watchWindow(window: BrowserWindow): void {
  window.webContents.on('console-message', (event) => {
    const where = `${event.sourceId}:${event.lineNumber}`;
    if (event.level === 'error') log.error(`renderer: ${event.message} (${where})`);
    else if (event.level === 'warning') log.warn(`renderer: ${event.message} (${where})`);
  });
  window.on('unresponsive', () => log.warn('window unresponsive'));
  window.on('responsive', () => log.info('window responsive again'));
}

/** Where the log and crash dumps go: XDG state on Linux, userData elsewhere. */
export function stateDirectory(): string {
  if (process.platform !== 'linux') return app.getPath('userData');
  const xdg = process.env['XDG_STATE_HOME'];
  const base = xdg !== undefined && xdg !== '' ? xdg : join(app.getPath('home'), '.local', 'state');
  return join(base, 'leathercad');
}
