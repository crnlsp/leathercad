import { posix, resolve, win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import { projectPathFromArgs } from './launchFile.js';

/**
 * Double-click a project to open it (slice 8.5): which argument is the project.
 *
 * Each case names the path rules it is written in, so every case passes on
 * every platform, and Windows paths are checked on Linux too.
 */
describe('the project a launch opens', () => {
  describe('on Linux and macOS', () => {
    it('is the argument naming a .lcp, as a double-click passes it', () => {
      expect(
        projectPathFromArgs(['/opt/LeatherCAD/leathercad', '/home/m/Wallet.lcp'], '/', posix),
      ).toBe('/home/m/Wallet.lcp');
    });

    it('skips Electron’s own arguments and switches, in development too', () => {
      expect(
        projectPathFromArgs(
          ['/usr/bin/electron', '.', '--no-sandbox', 'Patterns/Belt.LCP'],
          '/home/m',
          posix,
        ),
      ).toBe('/home/m/Patterns/Belt.LCP');
    });

    it('is nothing when no argument names a project', () => {
      expect(
        projectPathFromArgs(['/opt/LeatherCAD/leathercad', 'notes.txt', '.'], '/', posix),
      ).toBeNull();
      expect(projectPathFromArgs([], '/', posix)).toBeNull();
    });

    it('takes the first project named, since there is one window', () => {
      expect(projectPathFromArgs(['/a/one.lcp', '/a/two.lcp'], '/', posix)).toBe('/a/one.lcp');
    });
  });

  describe('on Windows', () => {
    it('is the argument naming a .lcp, as the installer’s file association passes it', () => {
      expect(
        projectPathFromArgs(
          [
            'C:\\Users\\m\\AppData\\Local\\Programs\\LeatherCAD\\LeatherCAD.exe',
            'C:\\Users\\m\\Documents\\Wallet.lcp',
          ],
          'C:\\Windows\\System32',
          win32,
        ),
      ).toBe('C:\\Users\\m\\Documents\\Wallet.lcp');
    });

    it('resolves a relative name against the directory the launch came from', () => {
      expect(
        projectPathFromArgs(
          ['electron.exe', '.', '--inspect', 'Patterns\\Belt.LCP'],
          'D:\\Leather',
          win32,
        ),
      ).toBe('D:\\Leather\\Patterns\\Belt.LCP');
    });
  });

  it('reads the running platform’s paths when given no rules, as the app does', () => {
    const cwd = process.cwd();
    expect(projectPathFromArgs(['Wallet.lcp'], cwd)).toBe(resolve(cwd, 'Wallet.lcp'));
  });
});
