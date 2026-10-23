import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { withApp } from './launchApp.js';

/**
 * Slice 8.9: asked by the maker, and only then, the app hears of a new release
 * and says so quietly, links to it, and installs nothing. GitHub is never
 * asked from a test: a server here answers as its releases API would.
 */

/** A stand-in for GitHub's latest release, counting the times it is asked. */
interface Releases {
  readonly url: string;
  readonly asked: () => number;
  /** The tag it answers with from now on. */
  tag: string;
  close(): Promise<void>;
}

async function releases(tag: string): Promise<Releases> {
  let asked = 0;
  const state = { tag };
  const server: Server = createServer((_request, response) => {
    asked++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ tag_name: state.tag }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/`,
    asked: () => asked,
    get tag() {
      return state.tag;
    },
    set tag(next: string) {
      state.tag = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The running version's next major, as a release tag: always newer. */
async function newerTag(app: ElectronApplication): Promise<string> {
  const running = await app.evaluate(({ app: electron }) => electron.getVersion());
  return `leathercad-v${String(Number(running.split('.')[0]) + 1)}.0.0`;
}

async function openAbout(window: Page): Promise<void> {
  await window.getByTestId('help-menu').click();
  await window.getByRole('menuitem', { name: 'About LeatherCAD' }).click();
  await expect(window.getByTestId('about-dialog')).toBeVisible();
}

test('a newer release marks Settings, which opens on Updates, and About links to it', async () => {
  // Tagged after launch, from the version the app reports.
  const server = await releases('none');
  try {
    await withApp(
      async (window, app) => {
        server.tag = await newerTag(app);
        const settings = window.getByTestId('settings');
        // Nothing was asked yet: no mark.
        await expect(window.getByTestId('update-mark')).toHaveCount(0);

        await settings.click();
        await window.getByTestId('settings-tab-updates').click();
        await window.getByTestId('check-updates').click();
        const status = window.getByTestId('settings-pane-updates').getByTestId('update-status');
        await expect(status).toHaveAttribute('data-state', 'available');
        await expect(status.getByTestId('update-link')).toHaveAttribute(
          'href',
          `https://github.com/crnlsp/leathercad/releases/tag/${server.tag}`,
        );
        await window.getByTestId('settings-close').click();

        // The quiet mark, and the button's name says why.
        await expect(window.getByTestId('update-mark')).toBeVisible();
        await expect(settings).toHaveAccessibleName('Settings — a new version is available');
        await settings.click();
        await expect(window.getByTestId('settings-pane-updates')).toBeVisible();
        await window.keyboard.press('Escape');

        await openAbout(window);
        await expect(
          window.getByTestId('about-dialog').getByTestId('update-status'),
        ).toHaveAttribute('data-state', 'available');
      },
      { env: { LEATHERCAD_RELEASES_URL: server.url } },
    );
  } finally {
    await server.close();
  }
});

test('the app asks nothing as it starts, and Check now asks once', async () => {
  const server = await releases('leathercad-v0.0.1');
  try {
    await withApp(
      async (window) => {
        await openAbout(window);
        await expect(window.getByTestId('about-dialog').getByTestId('update-status')).toHaveCount(
          0,
        );
        await window.keyboard.press('Escape');
        expect(server.asked()).toBe(0);

        await window.getByTestId('settings').click();
        await window.getByTestId('settings-tab-updates').click();
        await expect(window.getByTestId('updates-note')).toBeVisible();
        await window.getByTestId('check-updates').click();
        await expect(
          window.getByTestId('settings-pane-updates').getByTestId('update-status'),
        ).toHaveAttribute('data-state', 'current');
        await expect(window.getByTestId('update-mark')).toHaveCount(0);
        expect(server.asked()).toBe(1);
      },
      { env: { LEATHERCAD_RELEASES_URL: server.url } },
    );
  } finally {
    await server.close();
  }
});

test('with no network the app carries on, and Check now says it could not check', async () => {
  // playwright.config.ts points the check at a port nothing listens on.
  await withApp(async (window) => {
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-updates').click();
    await window.getByTestId('check-updates').click();
    await expect(
      window.getByTestId('settings-pane-updates').getByTestId('update-status'),
    ).toHaveAttribute('data-state', 'failed');
    await window.getByTestId('settings-close').click();
    await expect(window.getByTestId('update-mark')).toHaveCount(0);

    await openAbout(window);
    await expect(window.getByTestId('about-dialog').getByTestId('update-status')).toHaveAttribute(
      'data-state',
      'failed',
    );
  });
});

test('the Flatpak never asks: Settings says Flathub keeps it up to date', async () => {
  const server = await releases('leathercad-v99.0.0');
  try {
    await withApp(
      async (window) => {
        await window.getByTestId('settings').click();
        await window.getByTestId('settings-tab-updates').click();
        await expect(window.getByTestId('updates-managed')).toBeVisible();
        await expect(window.getByTestId('check-updates')).toHaveCount(0);
        await expect(window.getByTestId('updates-note')).toHaveCount(0);
        expect(server.asked()).toBe(0);
      },
      { env: { LEATHERCAD_RELEASES_URL: server.url, FLATPAK_ID: 'io.github.crnlsp.LeatherCAD' } },
    );
  } finally {
    await server.close();
  }
});

test('the version in the status bar says it checks for updates, and pressed, it does', async () => {
  const server = await releases('leathercad-v0.0.1');
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-version-'));
  try {
    await withApp(
      async (window, app) => {
        const version = window.getByTestId('version-button');
        await version.hover();
        await expect(window.getByRole('tooltip', { name: 'Check for updates' })).toBeVisible();
        const before = server.asked();

        await version.click();
        await expect(
          window.getByRole('tooltip', { name: 'You have the latest version.' }),
        ).toBeVisible();
        await expect(window.getByTestId('version-check-result')).toHaveText(
          'You have the latest version.',
        );
        expect(server.asked()).toBe(before + 1);

        // A newer release, found by the press, marks Settings.
        server.tag = await newerTag(app);
        await version.click();
        await expect(window.getByTestId('version-check-result')).toHaveText(/is available/);
        await expect(window.getByTestId('update-mark')).toBeVisible();
      },
      { env: { XDG_CONFIG_HOME: configHome, LEATHERCAD_RELEASES_URL: server.url } },
    );
  } finally {
    await server.close();
  }
});
