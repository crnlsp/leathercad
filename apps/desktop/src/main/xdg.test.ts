import { describe, expect, it } from 'vitest';

import { xdgHome } from './xdg.js';

/**
 * Where the E2E suite's isolation reaches (A6). The suite gives every launch
 * a configuration and a state directory of its own through XDG_CONFIG_HOME and
 * XDG_STATE_HOME. On Windows and macOS the development build honoured neither,
 * so every launch shared one profile: a second launch ended at the
 * single-instance lock, and a recovery copy one test left behind stood its
 * dialog over the next.
 */
describe('the XDG base directory the app honours', () => {
  const env = { XDG_CONFIG_HOME: '/tmp/e2e-config', XDG_STATE_HOME: '/tmp/e2e-state' };

  it('is the variable on Linux, packaged or not', () => {
    for (const packaged of [true, false]) {
      expect(xdgHome('XDG_CONFIG_HOME', { platform: 'linux', packaged, env })).toBe(
        '/tmp/e2e-config',
      );
      expect(xdgHome('XDG_STATE_HOME', { platform: 'linux', packaged, env })).toBe(
        '/tmp/e2e-state',
      );
    }
  });

  it('is the variable in the development build on Windows and macOS', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      expect(xdgHome('XDG_CONFIG_HOME', { platform, packaged: false, env })).toBe(
        '/tmp/e2e-config',
      );
      expect(xdgHome('XDG_STATE_HOME', { platform, packaged: false, env })).toBe('/tmp/e2e-state');
    }
  });

  it('is none for an installed app on Windows and macOS, which keeps the platform’s place', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      expect(xdgHome('XDG_CONFIG_HOME', { platform, packaged: true, env })).toBeUndefined();
      expect(xdgHome('XDG_STATE_HOME', { platform, packaged: true, env })).toBeUndefined();
    }
  });

  it('is none when the variable is unset or empty, as the XDG specification reads it', () => {
    for (const value of [undefined, '']) {
      expect(
        xdgHome('XDG_CONFIG_HOME', {
          platform: 'linux',
          packaged: false,
          env: { XDG_CONFIG_HOME: value },
        }),
      ).toBeUndefined();
    }
  });
});
