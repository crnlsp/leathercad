import { describe, expect, it } from 'vitest';

import { projectPathFromArgs } from './launchFile.js';

/** Double-click a project to open it (slice 8.5): which argument is the project. */
describe('the project a launch opens', () => {
  it('is the argument naming a .lcp, as a double-click passes it', () => {
    expect(projectPathFromArgs(['/opt/LeatherCAD/leathercad', '/home/m/Wallet.lcp'], '/')).toBe(
      '/home/m/Wallet.lcp',
    );
  });

  it('skips Electron’s own arguments and switches, in development too', () => {
    expect(
      projectPathFromArgs(
        ['/usr/bin/electron', '.', '--no-sandbox', 'Patterns/Belt.LCP'],
        '/home/m',
      ),
    ).toBe('/home/m/Patterns/Belt.LCP');
  });

  it('is nothing when no argument names a project', () => {
    expect(projectPathFromArgs(['/opt/LeatherCAD/leathercad', 'notes.txt', '.'], '/')).toBeNull();
    expect(projectPathFromArgs([], '/')).toBeNull();
  });

  it('takes the first project named, since there is one window', () => {
    expect(projectPathFromArgs(['/a/one.lcp', '/a/two.lcp'], '/')).toBe('/a/one.lcp');
  });
});
