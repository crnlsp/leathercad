import { join } from 'node:path';

import { BrowserWindow, Menu, app, shell } from 'electron';

import windowIcon from '../../build/icon.png?asset';
import { IPC } from '../shared/ipc.js';
import { startDiagnostics, stateDirectory, watchWindow } from './diagnostics.js';
import { menuTemplate } from './menu.js';
import { registerPlatformHandlers } from './platformHandlers.js';
import { RecoveryStore } from './recovery.js';

// Electron derives userData from the npm package name, which would give
// ~/.config/@leathercad/desktop. docs/file-format.md §6 specifies
// ~/.config/leathercad. Both calls must happen before the app is ready.
app.setName('LeatherCAD');
app.setPath('userData', join(app.getPath('appData'), 'leathercad'));

// The log and the crash handler, before anything else can fail.
startDiagnostics();

// Crash recovery (5.3b): this session's copy lives beside the log, in the
// platform's state directory, named for this process and this start.
const recovery = new RecoveryStore(join(stateDirectory(), 'recovery'), {
  pid: process.pid,
  startedAt: Date.now(),
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    // The smallest frame the layout supports (UI Foundations §7.2): below 900
    // px Parts and Properties are overlays, and nothing is removed.
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: 'LeatherCAD',
    // Linux takes the window's icon from here; Windows and macOS from the
    // packaged executable (slice 8.5a).
    icon: windowIcon,
    backgroundColor: '#1b1d21',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Non-negotiable, per docs/architecture.md §5. The renderer gets the
      // typed PlatformHost bridge and nothing else.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  watchWindow(mainWindow);

  // A renderer that dies takes the unsaved work with it, but the main process
  // lives on to a normal quit — which must not delete the copy that is the
  // only way back to that work.
  mainWindow.webContents.on('render-process-gone', () => recovery.keepOnQuit());

  // Avoid the white flash while the renderer boots.
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Nothing in this app should ever open a new window or navigate away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerPlatformHandlers(() => mainWindow, recovery);

  // The app's own menu, not Electron's default: no Reload and no developer
  // tools in a packaged build (8.5a). Each item asks the renderer, which runs
  // the same handler as the keyboard shortcut.
  app.setAboutPanelOptions({
    applicationName: 'LeatherCAD',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 cornelisp · Apache-2.0',
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        isMac: process.platform === 'darwin',
        packaged: app.isPackaged,
        send: (action) => mainWindow?.webContents.send(IPC.menuAction, action),
        openLogFolder: () => void shell.openPath(stateDirectory()),
      }),
    ),
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A clean exit: this session's recovery copy, and any it took over, go. A
// crash never reaches here, which is exactly why the copy survives one.
app.on('will-quit', () => recovery.releaseOnQuit());

app.on('window-all-closed', () => {
  // Linux and Windows quit with the last window; macOS conventionally does not.
  if (process.platform !== 'darwin') app.quit();
});
