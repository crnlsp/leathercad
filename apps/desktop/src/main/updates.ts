import type { UpdateStatus } from '@leathercad/platform';

/**
 * Where the latest release is asked for (8.9). GitHub's `latest` is the newest
 * release that is neither a draft nor a pre-release.
 */
export const RELEASES_URL = 'https://api.github.com/repos/crnlsp/leathercad/releases/latest';

/** The release pages a found version links to. */
const RELEASE_PAGE = 'https://github.com/crnlsp/leathercad/releases/tag/';

/** How long a check may take before it is called failed. */
const TIMEOUT_MS = 10_000;

/** The part of `fetch` a check uses: Electron's `net.fetch`, or a test's. */
export type Fetch = (
  url: string,
  init: { readonly headers: Record<string, string>; readonly signal: AbortSignal },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

/** A release version, `X.Y.Z`, with no leading zeros and nothing after it. */
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * The version a release tag names, or null. Tags read `leathercad-vX.Y.Z`
 * (R4); anything else — the older `vX.Y.Z`, a pre-release, another
 * component's — is not a LeatherCAD release this check will announce.
 */
export function releaseVersion(tag: unknown): string | null {
  if (typeof tag !== 'string' || !tag.startsWith('leathercad-v')) return null;
  const version = tag.slice('leathercad-v'.length);
  return VERSION.test(version) ? version : null;
}

/**
 * Whether `candidate` is a later release than `running`, part by part as
 * numbers, so 1.10.0 follows 1.9.0. False when either is not a version it can
 * read: a development build's version is never told to update.
 */
export function isNewer(candidate: string, running: string): boolean {
  const a = VERSION.exec(candidate);
  const b = VERSION.exec(running);
  if (a === null || b === null) return false;
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i]);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/**
 * What GitHub's answer says about the version running. Only the tag is read:
 * the page linked to is built here, so an answer cannot send the maker
 * anywhere but this project's own releases.
 */
export function statusFrom(body: unknown, running: string): UpdateStatus {
  const tag =
    typeof body === 'object' && body !== null ? (body as { tag_name?: unknown }).tag_name : null;
  const version = releaseVersion(tag);
  if (version === null) return { state: 'failed' };
  return isNewer(version, running)
    ? { state: 'available', version, url: `${RELEASE_PAGE}leathercad-v${version}` }
    : { state: 'current' };
}

/**
 * The update check (8.9): one GET for the latest release, which says nothing
 * about the maker or their patterns. It downloads and installs nothing.
 *
 * Never asks by itself: only when the maker presses *Check now* or the
 * version in the status bar. Held by the main process for the session, so a
 * new window on macOS reads the last answer rather than asking again.
 */
export class UpdateChecker {
  private last: Promise<UpdateStatus> | null = null;

  constructor(
    private readonly options: {
      readonly fetch: Fetch;
      /** The version running, `app.getVersion()`. */
      readonly running: string;
      /** Something else updates this copy — the Flatpak's Flathub — so never ask. */
      readonly managed: boolean;
      /** Another address than GitHub's, for the tests. */
      readonly url?: string;
    },
  ) {}

  /** The last check's answer, waited for while it runs; `idle` when none was asked. */
  status(): Promise<UpdateStatus> {
    if (this.options.managed) return Promise.resolve({ state: 'managed' });
    return this.last ?? Promise.resolve({ state: 'idle' });
  }

  /** Asks now, and keeps the answer for `status`. */
  check(): Promise<UpdateStatus> {
    if (this.options.managed) return Promise.resolve({ state: 'managed' });
    this.last = this.ask();
    return this.last;
  }

  private async ask(): Promise<UpdateStatus> {
    try {
      const response = await this.options.fetch(this.options.url ?? RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return { state: 'failed' };
      return statusFrom(await response.json(), this.options.running);
    } catch {
      return { state: 'failed' };
    }
  }
}
