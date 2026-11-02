import type { UpdateAnswer, UpdateStatus } from '@leathercad/platform';

/**
 * Where the latest release is asked for (8.9). GitHub's `latest` is the newest
 * release that is neither a draft nor a pre-release.
 */
export const RELEASES_URL = 'https://api.github.com/repos/crnlsp/leathercad/releases/latest';

/** The release pages a found version links to. */
const RELEASE_PAGE = 'https://github.com/crnlsp/leathercad/releases/tag/';

/** How long a check may take before it is called failed. */
const TIMEOUT_MS = 10_000;

/**
 * How long an answer stands before a press asks again: five minutes. A release
 * is not that frequent, and GitHub's unauthenticated API allows sixty requests
 * an hour from one address, which a row of presses should not spend.
 */
export const AGAIN_AFTER_MS = 5 * 60_000;

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
export function statusFrom(body: unknown, running: string, checkedAt: number): UpdateStatus {
  const tag =
    typeof body === 'object' && body !== null ? (body as { tag_name?: unknown }).tag_name : null;
  const version = releaseVersion(tag);
  if (version === null) return { state: 'failed' };
  const answer: UpdateAnswer = { checkedAt, againAt: checkedAt + AGAIN_AFTER_MS };
  return isNewer(version, running)
    ? { state: 'available', version, url: `${RELEASE_PAGE}leathercad-v${version}`, ...answer }
    : { state: 'current', ...answer };
}

/**
 * The update check (8.9): one GET for the latest release, which says nothing
 * about the maker or their patterns. It downloads and installs nothing.
 *
 * Never asks by itself: only when the maker presses *Check now* or the
 * version in the status bar, and not again for five minutes after an answer.
 * Held by the main process for the session, so the status bar, Settings and a
 * new window on macOS all read the last answer and share its five minutes.
 */
export class UpdateChecker {
  private last: Promise<UpdateStatus> | null = null;
  /** The last answer once it is in: what a press within its five minutes reads. */
  private answered: UpdateStatus | null = null;

  constructor(
    private readonly options: {
      readonly fetch: Fetch;
      /** The version running, `app.getVersion()`. */
      readonly running: string;
      /** Something else updates this copy — the Flatpak's Flathub — so never ask. */
      readonly managed: boolean;
      /** Another address than GitHub's, for the tests. */
      readonly url?: string;
      /** Milliseconds since the epoch; `Date.now` but in a test. */
      readonly now?: () => number;
    },
  ) {}

  /** The last check's answer, waited for while it runs; `idle` when none was asked. */
  status(): Promise<UpdateStatus> {
    if (this.options.managed) return Promise.resolve({ state: 'managed' });
    return this.last ?? Promise.resolve({ state: 'idle' });
  }

  /**
   * Asks now, and keeps the answer for `status` — unless a check is running,
   * which is waited for, or an answer is not five minutes old, which is read
   * back. A failed check is never kept that way: it can be tried again at once.
   */
  check(): Promise<UpdateStatus> {
    if (this.options.managed) return Promise.resolve({ state: 'managed' });
    const answered = this.answered;
    if (this.last !== null && answered === null) return this.last;
    if (answered !== null && 'againAt' in answered && this.now() < answered.againAt) {
      return Promise.resolve(answered);
    }
    this.answered = null;
    const asking = this.ask().then((status) => {
      this.answered = status;
      return status;
    });
    this.last = asking;
    return asking;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private async ask(): Promise<UpdateStatus> {
    try {
      const response = await this.options.fetch(this.options.url ?? RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return { state: 'failed' };
      return statusFrom(await response.json(), this.options.running, this.now());
    } catch {
      return { state: 'failed' };
    }
  }
}
