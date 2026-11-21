import { DEFAULT_PREFERENCES, type Preferences } from '@leathercad/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createI18n, resolveLocale } from '../../shared/i18n.js';
import { App } from './App.js';
import { WindowBoundary } from './Failure.js';
import { IS_MAC } from './keyCaps.js';
import { applyBindings } from './keymap.js';
import { readBindings } from './rebind.js';
import {
  keepKeysInDialogs,
  keepKeysInOpenLists,
  keepTabInDialogs,
  returnFocusFromDialogs,
} from './modalKeys.js';
import { getPlatformHost } from './platformBridge.js';
import { applyTheme } from './theme.js';
import './styles.css';

applyTheme(document.documentElement);
keepKeysInDialogs(window);
keepTabInDialogs(document);
returnFocusFromDialogs(document);
keepKeysInOpenLists(document);

const container = document.getElementById('root');
if (container === null) throw new Error('#root missing from index.html');

/**
 * The preferences and the system's languages are asked for before the first
 * render, so the window opens in its language rather than in English first
 * (ADR 0018). A bridge that cannot answer leaves the defaults; the app says
 * what went wrong once it is up.
 */
async function start(root: HTMLElement): Promise<void> {
  let preferences: Preferences = DEFAULT_PREFERENCES;
  let systemLanguages: readonly string[] = [];
  try {
    const host = getPlatformHost();
    [preferences, systemLanguages] = await Promise.all([
      host.getPreferences(),
      host.getSystemLanguages(),
    ]);
  } catch {
    // Defaults: English, until the preference can be read.
  }
  // The maker's keys (U.12), before anything shows one or hears one.
  applyBindings(readBindings(preferences.keyBindings, IS_MAC));
  // The words of the last resort, should the whole interface fail (QA2).
  const i18n = createI18n(resolveLocale(preferences.language, systemLanguages));
  createRoot(root).render(
    <StrictMode>
      <WindowBoundary i18n={i18n} onFailed={reportWindowFailed}>
        <App initialPreferences={preferences} systemLanguages={systemLanguages} />
      </WindowBoundary>
    </StrictMode>,
  );
}

/** Tells the main process the window failed, so its quit keeps the recovery copies (QA2). */
function reportWindowFailed(): void {
  try {
    void getPlatformHost()
      .windowFailed()
      .catch((error: unknown) =>
        console.error('the main process was not told the window failed:', error),
      );
  } catch (error) {
    console.error('the main process was not told the window failed:', error);
  }
}

void start(container);
