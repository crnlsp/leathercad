import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_URL, createAppProtocolHandler } from './appProtocol.js';

let directory: string;
let root: string;
const fetchFile = vi.fn(
  async (url: string) =>
    new Response(await readFile(fileURLToPath(url), 'utf8'), {
      headers: { 'Content-Type': 'text/javascript' },
    }),
);
let handle: ReturnType<typeof createAppProtocolHandler>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'leathercad-protocol-'));
  // Spaces and a literal URL metacharacter must survive a file URL round trip.
  root = join(directory, 'renderer #1');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<html>LeatherCAD</html>');
  await writeFile(join(root, 'assets', 'script #1.js'), 'export const loaded = true;');
  await writeFile(join(directory, 'private.txt'), 'outside the renderer');
  fetchFile.mockClear();
  handle = createAppProtocolHandler(root, fetchFile);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the app origin (R6)', () => {
  it.each([APP_URL, 'app://leathercad/', `${APP_URL}?version=1#top`])(
    'serves the bundled page at %s',
    async (url) => {
      const response = await handle(new Request(url));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<html>LeatherCAD</html>');
    },
  );

  it('decodes an asset once and preserves the file response MIME type', async () => {
    const response = await handle(new Request('app://leathercad/assets/script%20%231.js'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript');
    expect(await response.text()).toBe('export const loaded = true;');
    expect(fileURLToPath(fetchFile.mock.calls[0]![0])).toBe(join(root, 'assets', 'script #1.js'));
  });

  it('answers HEAD without a body', async () => {
    const response = await handle(new Request(APP_URL, { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript');
    expect(await response.text()).toBe('');
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])(
    'refuses %s without reading a file',
    async (method) => {
      const response = await handle(new Request(APP_URL, { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(fetchFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    'app://elsewhere/index.html',
    'app://leathercad.evil/index.html',
    'app://leathercad:123/index.html',
    'https://leathercad/index.html',
    'file:///index.html',
    'app://leathercad/%',
    'app://leathercad/%00index.html',
    'app://leathercad/%0aindex.html',
    'app://leathercad/..%2fprivate.txt',
    'app://leathercad/assets/%2e%2e%2f%2e%2e%2fprivate.txt',
    'app://leathercad/..%5cprivate.txt',
    'app://leathercad/C:%5cprivate.txt',
    'app://leathercad/index.html:stream',
    'app://leathercad//server/share',
  ])('refuses an invalid origin or path: %s', async (url) => {
    expect((await handle(new Request(url))).status).toBe(403);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it('refuses credentials even when passed directly by the protocol API', async () => {
    // The WHATWG Request constructor itself refuses credentials. Electron
    // supplies its own Request, so the handler must validate them too.
    const request = { url: 'app://user:password@leathercad/index.html', method: 'GET' } as Request;
    expect((await handle(request)).status).toBe(403);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it.each([
    'app://leathercad/../private.txt',
    'app://leathercad/%2e%2e/private.txt',
    'app://leathercad/%252e%252e%252fprivate.txt',
    'app://leathercad/assets/missing.js',
    'app://leathercad/assets',
  ])('does not expose outside files or fall back to HTML: %s', async (url) => {
    const response = await handle(new Request(url));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it('refuses a symlink into a neighbouring directory with the same path prefix', async () => {
    const outside = `${root}-private`;
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'not an asset');
    // A junction needs no elevated symlink permission on Windows.
    await symlink(outside, join(root, 'assets', 'escape'), 'junction');
    expect((await handle(new Request('app://leathercad/assets/escape/secret.txt'))).status).toBe(
      403,
    );
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it('does not expose a filesystem error when fetching an asset fails', async () => {
    fetchFile.mockRejectedValueOnce(new Error(`Cannot read ${root}`));
    const response = await handle(new Request(APP_URL));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});
