import { DocumentStore, emptyDocument, setProjectName } from '@leathercad/document';
import { loadProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { describe, expect, it } from 'vitest';

import { createLcpEncoder, type LcpWorker } from './lcpEncoder.js';
import { runLcpJob, type LcpJob, type LcpReply } from './lcpJob.js';
import { newTab } from './projectTabs.js';
import { RecoveryCopies } from './recoveryCopies.js';

/** A worker that answers when told to: the thread boundary, faked. */
class FakeWorker implements LcpWorker {
  onmessage: LcpWorker['onmessage'] = null;
  onerror: LcpWorker['onerror'] = null;
  onmessageerror: LcpWorker['onmessageerror'] = null;
  readonly asked: LcpJob[] = [];

  postMessage(message: LcpJob): void {
    this.asked.push(structuredClone(message));
  }

  terminate(): void {}

  answer(): void {
    const data: LcpReply = { ok: true, bytes: runLcpJob(this.asked.shift()!) };
    this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent<LcpReply>);
  }
}

/** A tab with unsaved work, the copies, and every write, clear and adoption asked, in order. */
function setup(writes: 'land' | 'fail' = 'land') {
  const store = new DocumentStore(emptyDocument('proj'));
  const tab = newTab('tab-1', store);
  store.dispatch(setProjectName('Wallet'));
  const asked: string[] = [];
  const copies: Uint8Array[] = [];
  const host = {
    writeRecovery: (id: string, data: Uint8Array) => {
      asked.push(`write ${id}`);
      copies.push(data);
      return writes === 'land' ? Promise.resolve() : Promise.reject(new Error('disk full'));
    },
    clearRecovery: (id: string) => {
      asked.push(`clear ${id}`);
      return Promise.resolve();
    },
  } as unknown as PlatformHost;
  const worker = new FakeWorker();
  const recovery = new RecoveryCopies(
    () => host,
    createLcpEncoder(() => worker),
    () => new Date('2026-11-02T10:00:00.000Z'),
  );
  return { store, tab, asked, copies, worker, recovery };
}

describe('recovery copies made off the window’s thread (PERF-009)', () => {
  it('writes a tab’s copy once it is made, of the document it was asked of', async () => {
    const { store, tab, asked, copies, worker, recovery } = setup();
    const asOf = store.getState().document;

    const writing = recovery.write(tab, '1.6.0');
    store.dispatch(setProjectName('Wallet, edited while the copy was made'));
    worker.answer();
    await writing;

    expect(asked).toEqual(['write tab-1']);
    expect(loadProject(copies[0]!).project).toEqual(asOf.project);
  });

  it('leaves no copy of a tab saved while its copy was being made', async () => {
    const { store, tab, asked, worker, recovery } = setup();

    const writing = recovery.write(tab, '1.6.0');
    // Saved: clean again, so its copy is cleared — and must not land after.
    tab.savedDocument = store.getState().document;
    recovery.clearSettled([tab]);
    worker.answer();
    await writing;

    expect(asked).toEqual(['clear tab-1']);
  });

  it('leaves no copy of a tab closed while its copy was being made', async () => {
    const { tab, asked, worker, recovery } = setup();

    const writing = recovery.write(tab, '1.6.0');
    recovery.clearSettled([]);
    worker.answer();
    await writing;

    expect(asked).toEqual(['clear tab-1']);
  });

  it('makes one copy of a tab at a time, and the next of what changed since', async () => {
    const { store, tab, worker, recovery } = setup();

    const writing = recovery.write(tab, '1.6.0');
    store.dispatch(setProjectName('Wallet, edited'));
    expect(recovery.due(tab)).toBe(false);

    worker.answer();
    await writing;
    expect(recovery.due(tab)).toBe(true);
  });

  it('asks for the tab’s own copy before letting a crashed session’s go', async () => {
    const { tab, asked, worker, recovery } = setup();

    const writing = recovery.write(tab, '1.6.0', () => {
      asked.push('adopt crashed');
      return Promise.resolve();
    });
    worker.answer();
    await writing;

    expect(asked).toEqual(['write tab-1', 'adopt crashed']);
  });

  it('writes a copy that did not land again at the next interval', async () => {
    const { tab, worker, recovery } = setup('fail');

    const writing = recovery.write(tab, '1.6.0');
    worker.answer();
    await expect(writing).rejects.toThrow('disk full');

    expect(recovery.due(tab)).toBe(true);
  });
});
