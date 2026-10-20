import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import {
  RELEASES_URL,
  UpdateChecker,
  isNewer,
  releaseVersion,
  statusFrom,
  type Fetch,
} from './updates.js';

/** Any X.Y.Z a release could carry. */
const version = fc
  .tuple(fc.nat({ max: 999 }), fc.nat({ max: 999 }), fc.nat({ max: 999 }))
  .map(([major, minor, patch]) => `${String(major)}.${String(minor)}.${String(patch)}`);

const parts = (v: string): number[] => v.split('.').map(Number);

describe('releaseVersion', () => {
  it('reads the version out of every tag in the leathercad-v form (R4)', () => {
    fc.assert(fc.property(version, (v) => releaseVersion(`leathercad-v${v}`) === v));
  });

  it.each([
    // The form before R4, and none at all.
    'v1.6.0',
    '1.6.0',
    // A pre-release, a build, or something after the version.
    'leathercad-v1.6.0-rc.1',
    'leathercad-v1.6.0+build',
    'leathercad-v1.6.0 ',
    // Not a whole version.
    'leathercad-v1.6',
    'leathercad-v1.6.0.1',
    'leathercad-v01.6.0',
    'leathercad-v',
    '',
    // Another component's tag.
    'other-v1.6.0',
  ])('refuses %j', (tag) => {
    expect(releaseVersion(tag)).toBeNull();
  });

  it.each([null, undefined, 160, {}, ['leathercad-v1.6.0']])(
    'refuses %j, which is no tag',
    (tag) => {
      expect(releaseVersion(tag)).toBeNull();
    },
  );
});

describe('isNewer', () => {
  it('orders versions part by part, as numbers', () => {
    fc.assert(
      fc.property(version, version, (a, b) => {
        const [x, y] = [parts(a), parts(b)];
        const first = x.findIndex((part, i) => part !== y[i]);
        expect(isNewer(a, b)).toBe(first !== -1 && x[first]! > y[first]!);
      }),
    );
  });

  it('never calls a version newer than itself', () => {
    fc.assert(fc.property(version, (v) => !isNewer(v, v)));
  });

  it('is never true both ways', () => {
    fc.assert(fc.property(version, version, (a, b) => !(isNewer(a, b) && isNewer(b, a))));
  });

  it('is transitive', () => {
    fc.assert(
      fc.property(version, version, version, (a, b, c) => {
        fc.pre(isNewer(a, b) && isNewer(b, c));
        return isNewer(a, c);
      }),
    );
  });

  it('reads 1.10.0 as newer than 1.9.0, which a comparison of text would not', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.9.0', '1.10.0')).toBe(false);
  });

  it('claims nothing when the running version is not one it can read', () => {
    expect(isNewer('2.0.0', '1.6.0-dev')).toBe(false);
    expect(isNewer('2.0.0', '')).toBe(false);
  });
});

describe('statusFrom', () => {
  it('says a release is available exactly when it is newer than the one running', () => {
    fc.assert(
      fc.property(version, version, (latest, running) => {
        const status = statusFrom({ tag_name: `leathercad-v${latest}` }, running);
        expect(status.state).toBe(isNewer(latest, running) ? 'available' : 'current');
      }),
    );
  });

  it("links to the release's own page, built here rather than taken from the answer", () => {
    expect(
      statusFrom(
        { tag_name: 'leathercad-v1.6.0', html_url: 'https://elsewhere.example/' },
        '1.5.0',
      ),
    ).toEqual({
      state: 'available',
      version: '1.6.0',
      url: 'https://github.com/crnlsp/leathercad/releases/tag/leathercad-v1.6.0',
    });
  });

  it.each([null, 'leathercad-v1.6.0', {}, { tag_name: 'v9.0.0' }, { tag_name: 9 }])(
    'calls %j a failed check, not news',
    (body) => {
      expect(statusFrom(body, '1.5.0')).toEqual({ state: 'failed' });
    },
  );
});

/** A fetch that answers with `body`, and records what it was asked. */
function answering(body: unknown, ok = true): Fetch & ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) }),
  );
}

describe('UpdateChecker', () => {
  const latest = { tag_name: 'leathercad-v1.6.0' };

  it('asks GitHub for the latest release, once, with nothing about the maker', async () => {
    const fetch = answering(latest);
    const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: false });
    await checker.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]! as Parameters<Fetch>;
    expect(url).toBe(RELEASES_URL);
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks the address it is given instead, for the tests', async () => {
    const fetch = answering(latest);
    await new UpdateChecker({
      fetch,
      running: '1.5.0',
      managed: false,
      url: 'http://127.0.0.1:1/',
    }).check();
    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:1/');
  });

  it('is idle until something asks', async () => {
    const fetch = answering(latest);
    const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: false });
    expect(await checker.status()).toEqual({ state: 'idle' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for the start's check while it runs, and keeps its answer", async () => {
    const fetch = answering(latest);
    const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: false });
    void checker.check();
    expect((await checker.status()).state).toBe('available');
    expect((await checker.status()).state).toBe('available');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again when asked again: Check now', async () => {
    const fetch = answering(latest);
    const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: false });
    await checker.check();
    await checker.check();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('says it failed when GitHub refuses, cannot be reached, or answers nonsense', async () => {
    const refused = answering(latest, false);
    const unreachable: Fetch = () =>
      Promise.reject(new TypeError('net::ERR_INTERNET_DISCONNECTED'));
    const nonsense: Fetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('JSON')),
      });
    for (const fetch of [refused, unreachable, nonsense]) {
      const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: false });
      expect(await checker.check()).toEqual({ state: 'failed' });
    }
  });

  it('never asks where something else keeps the app up to date — the Flatpak', async () => {
    const fetch = answering(latest);
    const checker = new UpdateChecker({ fetch, running: '1.5.0', managed: true });
    expect(await checker.status()).toEqual({ state: 'managed' });
    expect(await checker.check()).toEqual({ state: 'managed' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
