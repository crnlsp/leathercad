import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { OpenSession, OpenSessionTab, RecentOutcome } from '@leathercad/platform';
import { BrowserWindow, Menu, app, net, protocol, session, shell } from 'electron';
import log from 'electron-log/main';

import sampleProject from '../../../../fixtures/projects/bifold-wallet.lcp?asset';
import cardHolderTemplate from '../../../../fixtures/projects/card-holder.lcp?asset';
import coasterTemplate from '../../../../fixtures/projects/coaster.lcp?asset';
import keyFobTemplate from '../../../../fixtures/projects/key-fob.lcp?asset';
import windowIcon from '../../build/icon.png?asset';
import { NOTICES_FILE } from '../notices/thirdPartyNotices.js';
import { SOURCE_LOCALE, createI18n, resolveLocale, type I18n } from '../shared/i18n.js';
import { IPC } from '../shared/ipc.js';
import { APP_URL, createAppProtocolHandler } from './appProtocol.js';
import { startDiagnostics, stateDirectory, watchWindow } from './diagnostics.js';
import { mayOpenExternally } from './externalLinks.js';
import { projectPathFromArgs } from './launchFile.js';
import { applyBindings } from '../renderer/src/keymap.js';
import { macMenuTemplate, windowKeyFor } from './menu.js';
import { PathGrants } from './pathGrants.js';
import { registerPlatformHandlers } from './platformHandlers.js';
import { KeptCopies } from './keptCopies.js';
import { Templates } from './templates.js';
import { PreferencesStore } from './preferences.js';
import { ProjectWatch } from './projectWatch.js';
import { RecoveryStore } from './recovery.js';
import { UpdateChecker } from './updates.js';

// Electron derives userData from the npm package name, which would give
// ~/.config/@leathercad/desktop. docs/file-format.md §6 specifies
// ~/.config/leathercad. Both calls must happen before the app is ready.
app.setName('LeatherCAD');
app.setPath('userData', join(app.getPath('appData'), 'leathercad'));

// One LeatherCAD at a time (8.11). A second launch — a `.lcp` double-clicked
// on Linux or Windows while the app runs, or the Start menu — hands its
// command line to the running app (`second-instance`, below) and ends here,
// before it writes a log, a recovery copy or preferences.json. Two processes
// shared one preferences.json, last writer wins, and could hold the same
// project open and save over each other. The lock is the userData
// directory's, so a test that starts the app with a configuration of its own
// is a LeatherCAD of its own. macOS never starts a second copy: it sends
// `open-file` to this one. `process.exit`, not `app.exit`: the latter returns,
// and everything below this line would still run — the log's first line
// among it. The running app has the command line by now: asking for the lock
// waits until it has been delivered.
if (!app.requestSingleInstanceLock()) process.exit(0);

// Before ready: a real origin for modules, fonts and the PDF preview worker.
// CSP and CORS still apply; service workers and CSP bypass stay disabled.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// The log and the crash handler, before anything else can fail.
startDiagnostics();

// Crash recovery (5.3b): this session's copy lives beside the log, in the
// platform's state directory, named for this process and this start.
const recovery = new RecoveryStore(join(stateDirectory(), 'recovery'), {
  pid: process.pid,
  startedAt: Date.now(),
});

// The project templates (8.12): the ones that ship, in the picker's order —
// the sample wallet first — and the maker's own, beside the preferences.
const templates = new Templates(
  {
    'bifold-wallet': sampleProject,
    'card-holder': cardHolderTemplate,
    'key-fob': keyFobTemplate,
    coaster: coasterTemplate,
  },
  join(app.getPath('userData'), 'templates'),
);

// The unsaved work kept as the window closes (8.12), with Keep unsaved
// projects on: beside the preferences, in a folder of its own.
const kept = new KeptCopies(join(app.getPath('userData'), 'unsaved'));

// The files the renderer may touch: those chosen in the app's dialogs, or
// from the recent projects (8.2). Shared by the handlers and the launch.
const grants = new PathGrants();

// preferences.json, beside nothing but the app's other settings
// (docs/file-format.md §6). Read once, when the app is ready.
let preferences: PreferencesStore;

// The main process's own words — macOS's menu, its dialogs — in the
// interface's language (ADR 0018), the one the renderer resolves the same way.
let i18n: I18n = createI18n(SOURCE_LOCALE);

/** Follows the language preference; true when the words changed. */
function followLanguage(): boolean {
  const locale = resolveLocale(preferences.preferences.language, app.getPreferredSystemLanguages());
  if (locale === i18n.locale) return false;
  i18n = createI18n(locale);
  return true;
}

/**
 * Follows the maker's keys (U.12), as the renderer does: Full screen and Quit
 * are heard here (`windowKeyFor`), and macOS's menu shows Settings', Undo's
 * and Redo's. True when they changed.
 */
let keys = '{}';
/** Settings is listening for a new key (U.12): the window's keys are not acted on. */
let keyCapture = false;
function followKeys(): boolean {
  const next = JSON.stringify(preferences.preferences.keyBindings);
  if (next === keys) return false;
  keys = next;
  applyBindings(preferences.preferences.keyBindings);
  return true;
}

let mainWindow: BrowserWindow | null = null;

// The open projects' files, watched for what another program does to them
// (8.12): the window is told, and offers to read the file again.
const projectWatch = new ProjectWatch((path, change) => {
  mainWindow?.webContents.send(IPC.projectChanged, path, change);
});
app.on('will-quit', () => projectWatch.close());

/**
 * A project the operating system asked this launch to open (8.5): a `.lcp`
 * double-clicked on Linux or Windows arrives on the command line, one opened
 * before the app was ready on macOS arrives as *open-file*. Granted — the
 * maker chose it in their file manager, which is a dialog of its own — and
 * held until the renderer asks for it.
 */
let launchFile: string | null = projectPathFromArgs(process.argv.slice(1), process.cwd());
if (launchFile !== null) grants.grant(launchFile);

/**
 * A project the operating system handed to the running app: granted, as the
 * launch file is. One that arrives before the window is up waits with the
 * launch file; after, it goes to the renderer, which asks about unsaved work
 * first, as for Open.
 */
function openFromSystem(path: string): void {
  grants.grant(path);
  if (mainWindow === null) launchFile = path;
  else mainWindow.webContents.send(IPC.openFile, path);
}

// macOS hands a project to the running app rather than starting another.
app.on('open-file', (event, path) => {
  event.preventDefault();
  openFromSystem(path);
});

// Linux and Windows start another process, which hands over its command line
// and its directory and quits (8.11). The window comes forward either way —
// a launch from the Start menu names no project, and still means "show me
// LeatherCAD" — and then opens what the line names, as a first launch would.
app.on('second-instance', (_event, argv, workingDirectory) => {
  if (mainWindow !== null) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const path = projectPathFromArgs(argv, workingDirectory);
  if (path !== null) openFromSystem(path);
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
    // The shell's own colour, SHELL[800], behind the first frame. Written out:
    // the theme's package is the renderer's. The stylesheet's audit
    // (renderer/src/theme.test.ts) holds it to the theme.
    backgroundColor: '#1b1d21',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Non-negotiable, per docs/architecture.md §5. The renderer gets the
      // typed PlatformHost bridge and nothing else.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // No spellchecker (U.20): on Linux it fetched an English dictionary
      // from Google on first launch, whatever the interface's language, and
      // underlined the leather words it does not know. SECURITY.md names the
      // one request the app makes, its update check (ADR 0020).
      spellcheck: false,
    },
  });

  watchWindow(mainWindow);

  // The keys the native menu's roles used to give (8.7), now Linux and
  // Windows have no menu: full screen, Quit, and in development the tools.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = windowKeyFor(input, {
      isMac: process.platform === 'darwin',
      packaged: app.isPackaged,
      capturing: keyCapture,
    });
    if (key === null) return;
    event.preventDefault();
    if (key === 'full-screen') mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    // Through the window's close, so unsaved work is asked about (5.3a).
    else if (key === 'quit') app.quit();
    else mainWindow?.webContents.toggleDevTools();
  });

  // A renderer that dies takes the unsaved work with it, but the main process
  // lives on — to a normal quit, or on macOS to a new window — and neither
  // may delete the copy that is the only way back to that work.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') recovery.rendererGone();
  });

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
  if (!app.isPackaged && devServerUrl !== undefined && devServerUrl !== '') {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadURL(APP_URL);
  }
}

/**
 * The third-party notices (8.6b): the file the build wrote beside the
 * renderer, for About to show in the app's own dialog (U.20) — until then a
 * bare window of its own, white and in a system face. A development build
 * serves the renderer from Vite and has none: null, and About says so.
 */
async function readNotices(): Promise<string | null> {
  try {
    return await readFile(join(__dirname, '../renderer', NOTICES_FILE), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The application menu (8.7): none on Linux and Windows — the project bar
 * holds its actions, Settings and Help — and the platform's minimal one on
 * macOS, whose About and Settings open the renderer's dialogs. Not Electron's
 * default, which shipped Reload and the developer tools (8.5a).
 */
function buildMenu(): void {
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate(
          macMenuTemplate({
            send: (action) => mainWindow?.webContents.send(IPC.menuAction, action),
            t: i18n.t,
          }),
        )
      : null,
  );
}

/**
 * A recent project, chosen in the Project menu (8.2, 8.7): grants it, then
 * asks the renderer to open it, which asks about unsaved work first exactly
 * as Open does. Only a path on the list is opened. A project that is gone is
 * taken off the list, and the renderer tells the maker why it vanished, in
 * the app's own dialog (U.20).
 */
/**
 * The tabs open when the app last closed (8.12), handed to the renderer once,
 * as it starts: each project still on disk, granted — the maker chose each in
 * a dialog in an earlier session, as for the recent list — and the unsaved
 * work kept for any, read back. A second ask, from a reloaded page, gets none:
 * what it shows now is the session. Kept copies the last session no longer
 * names are let go.
 */
let sessionTaken = false;
async function takeSession(): Promise<OpenSession> {
  if (sessionTaken) return { tabs: [], active: null };
  sessionTaken = true;
  const { tabs, active } = preferences.session;
  const handed: OpenSessionTab[] = [];
  let front: number | null = null;
  for (const [index, tab] of tabs.entries()) {
    const path = tab.path !== null && existsSync(tab.path) ? tab.path : null;
    const data = tab.kept === null ? null : await kept.read(tab.kept);
    if (path === null && data === null) continue;
    if (path !== null) grants.grant(path);
    if (index === active) front = handed.length;
    handed.push({ path, data, view: tab.view, camera: tab.camera });
  }
  await kept.keepOnly(new Set(tabs.flatMap((tab) => (tab.kept === null ? [] : [tab.kept]))));
  return { tabs: handed, active: front };
}

async function openRecent(path: string): Promise<RecentOutcome> {
  if (!preferences.lists(path)) return 'unlisted';
  if (!existsSync(path)) {
    await preferences.forgetRecent(path);
    return 'gone';
  }
  grants.grant(path);
  mainWindow?.webContents.send(IPC.openFile, path);
  return 'opening';
}

app.whenReady().then(() => {
  protocol.handle(
    'app',
    createAppProtocolHandler(join(__dirname, '../renderer'), (url) => net.fetch(url)),
  );

  preferences = new PreferencesStore(join(app.getPath('userData'), 'preferences.json'));

  // The update check (8.9, ADR 0020): the app's one network request, made
  // only when the maker asks for it, through Chromium's stack so a system
  // proxy applies. The Flatpak never asks — Flathub updates it, and it has no
  // network. The tests point it elsewhere.
  const releasesUrl = process.env['LEATHERCAD_RELEASES_URL'];
  const updates = new UpdateChecker({
    fetch: (url, init) => net.fetch(url, init),
    running: app.getVersion(),
    managed: process.env['FLATPAK_ID'] !== undefined,
    ...(releasesUrl !== undefined && releasesUrl !== '' ? { url: releasesUrl } : {}),
  });

  registerPlatformHandlers(
    () => mainWindow,
    recovery,
    grants,
    preferences,
    (path) => {
      // The operating system's own list too: the dock on macOS, the jump list
      // on Windows.
      app.addRecentDocument(path);
    },
    () => {
      const file = launchFile;
      launchFile = null;
      return file;
    },
    takeSession,
    (path) => openRecent(path),
    readNotices,
    // A new language rebuilds macOS's menu in it, at once, as the window's
    // own words change (8.7's Settings apply immediately); so do new keys.
    () => {
      const words = followLanguage();
      if (followKeys() || words) buildMenu();
    },
    (capturing) => {
      keyCapture = capturing;
    },
    updates,
    projectWatch,
    kept,
    templates,
  );

  followLanguage();
  followKeys();
  buildMenu();

  // The session's spellchecker off too (U.20), and with no language: off
  // alone, and the window's `spellcheck: false`, still let Chromium fetch
  // en-US-10-1.bdic once a field was typed in. Chromium still makes an empty
  // Dictionaries/ folder in userData; nothing is put in it.
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerLanguages([]);

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
