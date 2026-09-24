import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { BrowserWindow, Menu, app, shell } from 'electron';
import log from 'electron-log/main';

import windowIcon from '../../build/icon.png?asset';
import { NOTICES_FILE } from '../notices/thirdPartyNotices.js';
import { IPC } from '../shared/ipc.js';
import { startDiagnostics, stateDirectory, watchWindow } from './diagnostics.js';
import { mayOpenExternally } from './externalLinks.js';
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

  // Nothing in this app should ever open a new window or navigate away. A
  // link to the web goes to the browser; anything else goes nowhere.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (mayOpenExternally(url)) void shell.openExternal(url);
    else log.warn(`refused to open ${JSON.stringify(url)}: only https: links leave the app`);
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

/**
 * Help › Third-Party Notices: the file the build wrote beside the renderer
 * (8.6b), in a window of its own. Plain text, no preload, nothing to run, and
 * nowhere to navigate to.
 */
let noticesWindow: BrowserWindow | null = null;

function openNotices(): void {
  if (noticesWindow !== null) {
    noticesWindow.focus();
    return;
  }
  noticesWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'Third-Party Notices',
    icon: windowIcon,
    ...(mainWindow === null ? {} : { parent: mainWindow }),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  noticesWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  noticesWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  noticesWindow.on('closed', () => {
    noticesWindow = null;
  });
  // A development build serves the renderer from Vite and has no notices
  // file; the window says so rather than showing an error page.
  const file = join(__dirname, '../renderer', NOTICES_FILE);
  if (existsSync(file)) {
    void noticesWindow.loadFile(file);
  } else {
    void noticesWindow.loadURL(
      `data:text/plain;charset=utf-8,${encodeURIComponent('Third-party notices are written by a production build (pnpm build).')}`,
    );
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
    copyright: 'Copyright © 2026 crnlsp · Apache-2.0',
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        isMac: process.platform === 'darwin',
        packaged: app.isPackaged,
        send: (action) => mainWindow?.webContents.send(IPC.menuAction, action),
        openLogFolder: () => void shell.openPath(stateDirectory()),
        openNotices,
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
