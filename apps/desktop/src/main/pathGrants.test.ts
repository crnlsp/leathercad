import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PathGrants } from './pathGrants.js';

/**
 * Which files the renderer may touch (the platform boundary, architecture §5).
 *
 * The renderer is sandboxed, but a renderer that runs something it should not
 * — a crafted file, a dependency gone bad — could still ask the main process
 * to read or overwrite any file the user can. So the main process only acts on
 * a path the user chose, in one of its own dialogs, during this session.
 */

const dir = resolve('/work/patterns');
const wallet = join(dir, 'wallet.lcp');

describe('PathGrants', () => {
  it('refuses everything until a dialog has returned a path', () => {
    const grants = new PathGrants();
    expect(grants.allows(wallet, 'read')).toBe(false);
    expect(grants.allows(wallet, 'write')).toBe(false);
  });

  it('allows reading and writing the path a dialog returned', () => {
    const grants = new PathGrants();
    grants.grant(wallet);
    expect(grants.allows(wallet, 'read')).toBe(true);
    // Save after Open writes back to the file that was opened.
    expect(grants.allows(wallet, 'write')).toBe(true);
  });

  it('refuses every other path, however it is spelled', () => {
    const grants = new PathGrants();
    grants.grant(wallet);
    expect(grants.allows(join(dir, 'other.lcp'), 'read')).toBe(false);
    expect(grants.allows(`${dir}/../patterns/other.lcp`, 'write')).toBe(false);
    expect(grants.allows(resolve('/home/someone/.bashrc'), 'write')).toBe(false);
  });

  it('treats two spellings of the granted path as that path', () => {
    const grants = new PathGrants();
    grants.grant(wallet);
    expect(grants.allows(join(dir, 'sub', '..', 'wallet.lcp'), 'write')).toBe(true);
  });

  it('refuses a relative path, and anything that is not a string', () => {
    const grants = new PathGrants();
    grants.grant(wallet);
    expect(grants.allows('wallet.lcp', 'read')).toBe(false);
    expect(grants.allows(undefined, 'read')).toBe(false);
    expect(grants.allows(42, 'read')).toBe(false);
    expect(grants.allows({ toString: () => wallet }, 'read')).toBe(false);
  });

  it('never grants a relative path', () => {
    const grants = new PathGrants();
    grants.grant('wallet.lcp');
    expect(grants.allows(resolve('wallet.lcp'), 'read')).toBe(false);
  });

  describe("a save dialog's filters", () => {
    // Save and Export append the extension when the name typed has none.
    it('also allow the path with a filter extension appended', () => {
      const grants = new PathGrants();
      const typed = join(dir, 'wallet');
      grants.grant(typed, ['lcp']);
      expect(grants.allows(typed, 'write')).toBe(true);
      expect(grants.allows(`${typed}.lcp`, 'write')).toBe(true);
      expect(grants.allows(`${typed}.pdf`, 'write')).toBe(false);
      expect(grants.allows(`${typed}.lcp.lcp`, 'write')).toBe(false);
    });

    it('never let an extension name another file', () => {
      const grants = new PathGrants();
      const typed = join(dir, 'wallet');
      grants.grant(typed, ['/../../.bashrc', 'lcp/../x', '..', '']);
      expect(grants.allows(resolve('/work/.bashrc'), 'write')).toBe(false);
      expect(grants.allows(`${typed}./../../.bashrc`, 'write')).toBe(false);
      expect(grants.allows(join(dir, 'x'), 'write')).toBe(false);
      expect(grants.allows(`${typed}.`, 'write')).toBe(false);
    });

    it('ignore a wildcard, and a leading dot', () => {
      const grants = new PathGrants();
      const typed = join(dir, 'wallet');
      grants.grant(typed, ['*', '.pdf']);
      expect(grants.allows(`${typed}.pdf`, 'write')).toBe(true);
      expect(grants.allows(`${typed}.*`, 'write')).toBe(false);
    });
  });

  describe('opening in the external viewer', () => {
    it('allows a granted PDF', () => {
      const grants = new PathGrants();
      grants.grant(join(dir, 'wallet.pdf'));
      expect(grants.allows(join(dir, 'wallet.pdf'), 'view')).toBe(true);
      expect(grants.allows(join(dir, 'WALLET.PDF'), 'view')).toBe(false);
    });

    it('refuses anything that is not a PDF, granted or not', () => {
      // shell.openPath runs whatever the system registered for the file, so a
      // granted path named .desktop, .exe or .sh would be a program.
      const grants = new PathGrants();
      for (const name of ['wallet.lcp', 'run.sh', 'run.exe', 'run.desktop', 'wallet']) {
        grants.grant(join(dir, name));
        expect(grants.allows(join(dir, name), 'view')).toBe(false);
      }
    });

    it('allows a PDF whose extension is in capitals', () => {
      const grants = new PathGrants();
      grants.grant(join(dir, 'WALLET.PDF'));
      expect(grants.allows(join(dir, 'WALLET.PDF'), 'view')).toBe(true);
    });
  });
});
