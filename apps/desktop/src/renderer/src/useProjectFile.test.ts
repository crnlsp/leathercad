import {
  DocumentStore,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setProjectName,
  translateFeatures,
} from '@leathercad/document';
import { loadProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Translate } from '../../shared/i18n.js';
import { ProjectTabs, isDirty, newTab, projectNameOf } from './projectTabs.js';
import { fileName, useProjectFile } from './useProjectFile.js';

/** A project saved without a name is named after its file (8.12): which part of the path. */
describe('the name a file gives a project', () => {
  it('is the file’s name without its extension, on either platform’s paths', () => {
    expect(projectNameOf('/home/m/Portfel.lcp')).toBe('Portfel');
    expect(projectNameOf('C:\\Wzory\\Pasek v1.2.LCP')).toBe('Pasek v1.2');
  });

  it('keeps every other dot: "Wallet v1.2" is a name', () => {
    expect(projectNameOf('/p/Wallet v1.2.lcp')).toBe('Wallet v1.2');
  });
});

describe('fileName', () => {
  it('is the last part of a path, whichever separator the platform uses', () => {
    expect(fileName('/home/maker/Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('C:\\Users\\maker\\Wallet.lcp')).toBe('Wallet.lcp');
    expect(fileName('Wallet.lcp')).toBe('Wallet.lcp');
  });
});

/** Ctrl+S during a drag writes the document from before it (Q36). */
describe('saving while a gesture is under way', () => {
  function setup() {
    const store = new DocumentStore(
      setProjectName('Wallet').apply(
        addPart(
          rectanglePart('part-1', 'feat-1', 'Panel', rectShape({ x: 0, y: 0 }, 100, 50)),
        ).apply(emptyDocument('proj')),
      ),
    );
    const tab = newTab('tab-1', store);
    tab.file = { path: '/p/Wallet.lcp', error: null };
    const tabs = new ProjectTabs(tab);
    const writes: Uint8Array[] = [];
    const host = {
      writeFile: (_path: string, data: Uint8Array) => {
        writes.push(data);
        return Promise.resolve();
      },
      noteRecentFile: () => Promise.resolve(),
    } as unknown as PlatformHost;
    let file: ReturnType<typeof useProjectFile> | undefined;
    function Probe() {
      file = useProjectFile(
        tabs,
        () => host,
        '0.0.0',
        () => tab,
        () => emptyDocument('blank'),
        ((key: string) => key) as Translate,
        () => undefined,
      );
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    return { store, tab, writes, save: () => file!.save(tab) };
  }

  it('writes the document as it was before the drag, and leaves the tab unsaved with the drag', async () => {
    const { store, tab, writes, save } = setup();
    const before = store.getState().document;

    store.begin({ action: 'move' });
    store.preview(translateFeatures(['feat-1'], { x: 40, y: 0 }));
    const preview = store.getState().document;

    expect(await save()).toBe(true);

    expect(writes).toHaveLength(1);
    expect(loadProject(writes[0]!).project).toEqual(before.project);
    expect(loadProject(writes[0]!).project).not.toEqual(preview.project);
    // What is on disk is `before`: the tab is saved as of that, so once the
    // drag commits the project is unsaved, and a cancelled drag leaves it clean.
    expect(tab.savedDocument).toBe(before);
    store.commit();
    expect(isDirty(tab)).toBe(true);
  });
});
