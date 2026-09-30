import { DEFAULT_PREFERENCES, type Preferences } from '@leathercad/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { getPlatformHost } from './platformBridge.js';
import { applyTheme } from './theme.js';
import './styles.css';

applyTheme(document.documentElement);

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
  createRoot(root).render(
    <StrictMode>
      <App initialPreferences={preferences} systemLanguages={systemLanguages} />
    </StrictMode>,
  );
}

void start(container);
