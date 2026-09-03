import { describe, expect, it } from 'vitest';

import { InMemoryPlatformHost } from './fake.js';

describe('InMemoryPlatformHost', () => {
  it('round-trips a file', async () => {
    const host = new InMemoryPlatformHost();
    const data = new Uint8Array([1, 2, 3, 255]);

    await host.writeFile('/p/project.lcp', data);

    expect(await host.readFile('/p/project.lcp')).toEqual(data);
  });

  it('rejects reading a file that was never written', async () => {
    const host = new InMemoryPlatformHost();

    await expect(host.readFile('/p/missing.lcp')).rejects.toThrow(/no such file/);
  });

  it('isolates stored bytes from later mutation by the caller', async () => {
    const host = new InMemoryPlatformHost();
    const original = new Uint8Array([1, 2, 3]);

    await host.writeFile('/p/a.lcp', original);
    original[0] = 99;

    expect((await host.readFile('/p/a.lcp'))[0]).toBe(1);
  });

  it('isolates the store from mutation of a returned buffer', async () => {
    const host = new InMemoryPlatformHost();
    await host.writeFile('/p/a.lcp', new Uint8Array([1, 2, 3]));

    const first = await host.readFile('/p/a.lcp');
    first[0] = 99;

    expect((await host.readFile('/p/a.lcp'))[0]).toBe(1);
  });

  it('returns queued dialog paths in order, then null once the queue is empty', async () => {
    const host = new InMemoryPlatformHost();
    host.nextOpenPaths.push('/p/one.lcp', '/p/two.lcp');

    expect(await host.showOpenDialog({})).toBe('/p/one.lcp');
    expect(await host.showOpenDialog({})).toBe('/p/two.lcp');
    // An exhausted queue models the user cancelling — the case tests forget.
    expect(await host.showOpenDialog({})).toBeNull();
  });

  it('records dialog options so tests can assert on filters', async () => {
    const host = new InMemoryPlatformHost();
    const filters = [{ name: 'LeatherCAD project', extensions: ['lcp'] }];

    await host.showSaveDialog({ title: 'Save', filters });

    expect(host.dialogCalls).toEqual([{ kind: 'save', options: { title: 'Save', filters } }]);
  });

  it('records external open requests', async () => {
    const host = new InMemoryPlatformHost();

    await host.openInExternalViewer('/p/pattern.pdf');

    expect(host.openedExternally).toEqual(['/p/pattern.pdf']);
  });
});
