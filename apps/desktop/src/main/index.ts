import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { BrowserWindow, Menu, app, dialog, shell } from 'electron';
import log from 'electron-log/main';

import sampleProject from '../../../../fixtures/projects/bifold-wallet.lcp?asset';
import windowIcon from '../../build/icon.png?asset';
import { NOTICES_FILE } from '../notices/thirdPartyNotices.js';
import { IPC } from '../shared/ipc.js';
import { startDiagnostics, stateDirectory, watchWindow } from './diagnostics.js';
import { mayOpenExternally } from './externalLinks.js';
import { projectPathFromArgs } from './launchFile.js';
import { menuTemplate } from './menu.js';
import { PathGrants } from './pathGrants.js';
import { registerPlatformHandlers } from './platformHandlers.js';
import { PreferencesStore } from './preferences.js';
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

// The files the renderer may touch: those chosen in the app's dialogs, or
// from Open Recent (8.2). Shared by the handlers and the menu.
const grants = new PathGrants();

// preferences.json, beside nothing but the app's other settings
// (docs/file-format.md §6). Read once, before the menu that lists its recent
// projects is built.
let preferences: PreferencesStore;

let mainWindow: BrowserWindow | null = null;

/**
 * A project the operating system asked this launch to open (8.5): a `.lcp`
 * double-clicked on Linux or Windows arrives on the command line, one opened
 * before the app was ready on macOS arrives as *open-file*. Granted — the
 * maker chose it in their file manager, which is a dialog of its own — and
 * held until the renderer asks for it.
 */
let launchFile: string | null = projectPathFromArgs(process.argv.slice(1), process.cwd());
if (launchFile !== null) grants.grant(launchFile);

// macOS hands a project to the running app rather than starting another: one
// that arrives before the window is up waits with the launch file; after, it
// goes to the renderer, which asks about unsaved work first, as for Open.
app.on('open-file', (event, path) => {
  event.preventDefault();
  grants.grant(path);
  if (mainWindow === null) launchFile = path;
  else mainWindow.webContents.send(IPC.openFile, path);
});

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

/**
 * The app's own menu, not Electron's default: no Reload and no developer
 * tools in a packaged build (8.5a). Each item asks the renderer, which runs
 * the same handler as the keyboard shortcut. Rebuilt whenever the recent list
 * changes, since the menu is where it is shown.
 */
function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        isMac: process.platform === 'darwin',
        packaged: app.isPackaged,
        send: (action) => mainWindow?.webContents.send(IPC.menuAction, action),
        openLogFolder: () => void shell.openPath(stateDirectory()),
        openNotices,
        recentFiles: preferences.recentFiles,
        home: app.getPath('home'),
        openRecent: (path) => void openRecent(path),
        clearRecent: () => {
          void preferences.clearRecent();
          app.clearRecentDocuments();
          buildMenu();
        },
      }),
    ),
  );
}

/**
 * File › Open Recent: grants the project, then asks the renderer to open it,
 * which asks about unsaved work first exactly as Open does. A project that is
 * gone is taken off the list, and the maker is told why it vanished.
 */
async function openRecent(path: string): Promise<void> {
  if (!preferences.recentFiles.includes(path)) return;
  if (!existsSync(path)) {
    await preferences.forgetRecent(path);
    buildMenu();
    const message = {
      type: 'info' as const,
      message: 'That project is no longer there',
      detail: `${path}\n\nIt was moved, renamed or deleted, so it has been taken off Open Recent.`,
    };
    if (mainWindow === null) await dialog.showMessageBox(message);
    else await dialog.showMessageBox(mainWindow, message);
    return;
  }
  grants.grant(path);
  mainWindow?.webContents.send(IPC.openFile, path);
}

app.whenReady().then(() => {
  preferences = new PreferencesStore(join(app.getPath('userData'), 'preferences.json'));

  registerPlatformHandlers(
    () => mainWindow,
    recovery,
    grants,
    preferences,
    (path) => {
      // The operating system's own list too: the dock on macOS, the jump list
      // on Windows.
      app.addRecentDocument(path);
      buildMenu();
    },
    sampleProject,
    () => {
      const file = launchFile;
      launchFile = null;
      return file;
    },
  );

  app.setAboutPanelOptions({
    applicationName: 'LeatherCAD',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 crnlsp · Apache-2.0',
  });
  buildMenu();

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
