import type { Plugin } from 'vite';

/**
 * What the development build needs beyond the shipped policy: the Vite dev
 * server's hot-reload socket, and the server itself on localhost.
 */
export const DEV_SERVER_SOURCES = 'ws: http://localhost:*';

const CONNECT_SELF = "connect-src 'self'";

/**
 * `src/renderer/index.html` carries the Content-Security-Policy the app ships
 * with, whose `connect-src` is `'self'` alone: the packaged renderer loads from
 * the app's own files and talks to nothing. Only `pnpm dev` needs a socket, so
 * only the dev server's copy of the page is given one.
 */
export function allowDevServer(html: string): string {
  const count = html.split(CONNECT_SELF).length - 1;
  if (count !== 1) {
    throw new Error(
      `index.html must hold exactly one "${CONNECT_SELF}" for the dev server to extend; found ${count}`,
    );
  }
  return html.replace(CONNECT_SELF, `${CONNECT_SELF} ${DEV_SERVER_SOURCES}`);
}

/** Applies `allowDevServer` to the page the dev server serves, and never to a build. */
export function devServerCsp(): Plugin {
  return {
    name: 'leathercad:dev-server-csp',
    apply: 'serve',
    transformIndexHtml: (html) => allowDevServer(html),
  };
}
