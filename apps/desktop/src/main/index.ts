import { join } from 'node:path';

import { BrowserWindow, app, shell } from 'electron';

import { startDiagnostics, watchWindow } from './diagnostics.js';
import { registerPlatformHandlers } from './platformHandlers.js';

// Electron derives userData from the npm package name, which would give
// ~/.config/@leathercad/desktop. docs/file-format.md §6 specifies
// ~/.config/leathercad. Both calls must happen before the app is ready.
app.setName('LeatherCAD');
app.setPath('userData', join(app.getPath('appData'), 'leathercad'));

// The log and the crash handler, before anything else can fail.
startDiagnostics();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'LeatherCAD',
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
  registerPlatformHandlers(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Linux and Windows quit with the last window; macOS conventionally does not.
  if (process.platform !== 'darwin') app.quit();
});
