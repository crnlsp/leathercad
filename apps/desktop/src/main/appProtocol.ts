import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_URL = 'app://leathercad/index.html';

/** True only for a descendant, never the root itself or a neighbouring directory. */
function isInside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/**
 * R6: the app origin serves only the built renderer, including in app.asar.
 * A URL is never an OS path: decode it once, reject traversal and Windows
 * path syntax, then check both the lexical path and its real target. No
 * fallback to index.html: a missing script must fail, not become HTML.
 *
 * Electron's net.fetch reads the validated file URL (with asar and MIME
 * support). Injected so the boundary can be tested against real files in Node.
 */
export function createAppProtocolHandler(
  rendererRoot: string,
  fetchFile: (url: string) => Promise<Response>,
): (request: Request) => Promise<Response> {
  const root = resolve(rendererRoot);
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    let file: string;
    try {
      const url = new URL(request.url);
      if (
        url.protocol !== 'app:' ||
        url.host !== 'leathercad' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        return new Response(null, { status: 403 });
      }
      const pathname = decodeURIComponent(url.pathname);
      const segments = (pathname === '/' ? '/index.html' : pathname).slice(1).split('/');
      if (
        !pathname.startsWith('/') ||
        segments.some(
          (segment) =>
            segment === '' ||
            segment === '.' ||
            segment === '..' ||
            /[\\:]/.test(segment) ||
            [...segment].some((character) => character.charCodeAt(0) < 32),
        )
      ) {
        return new Response(null, { status: 403 });
      }
      file = resolve(root, ...segments);
      if (!isInside(root, file)) return new Response(null, { status: 403 });
    } catch {
      return new Response(null, { status: 403 });
    }

    try {
      const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
      if (!isInside(realRoot, realFile)) return new Response(null, { status: 403 });
      if (!(await stat(realFile)).isFile()) return new Response(null, { status: 404 });
      const response = await fetchFile(pathToFileURL(realFile).href);
      if (request.method === 'HEAD') {
        await response.body?.cancel();
        return new Response(null, { status: response.status, headers: response.headers });
      }
      return response;
    } catch {
      // Missing/unreadable assets fail without exposing an installation path.
      return new Response(null, { status: 404 });
    }
  };
}
