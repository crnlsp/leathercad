import { ResourceLimitError } from '@leathercad/core';
import { loadProject, readFeatures } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import { CATALOGUES, createI18n, pseudoCatalogue, type Translate } from '../../shared/i18n.js';
import { REFUSAL } from '../../shared/refusals.js';
import { fileErrorText } from './fileErrorText.js';

const english = createI18n('en').t;
/** A language every word of which differs from English: a word not from `t()` shows. */
const expanded = createI18n('en-XA', {
  en: CATALOGUES['en'] ?? {},
  'en-XA': pseudoCatalogue(en),
}).t;
const polish = createI18n('pl').t;

/** What loading these bytes was refused with. */
function refused(bytes: Uint8Array): unknown {
  try {
    loadProject(bytes);
  } catch (error) {
    return error;
  }
  throw new Error('the file loaded');
}

/** As Electron hands the renderer a main-process error: its message, wrapped. */
function overIpc(message: string): Error {
  return new Error(`Error invoking remote method 'platform:readFile': Error: ${message}`);
}

const NOT_A_ZIP = new Uint8Array([1, 2, 3, 4]);

/** X30: a file the loader refuses is said in the interface's words, never the loader's (ADR 0018). */
describe('an unreadable file', () => {
  it('is said from the catalogue, in English', () => {
    expect(fileErrorText(refused(NOT_A_ZIP), english)).toBe(english('file.notArchive'));
  });

  it('is said from the catalogue in another language, with no English of the loader’s', () => {
    const said = fileErrorText(refused(NOT_A_ZIP), expanded);
    expect(said).toBe(expanded('file.notArchive'));
    expect(said).toMatch(/^\[.*\]$/);
    expect(fileErrorText(refused(NOT_A_ZIP), polish)).not.toMatch(/readable|archive|zip/i);
  });

  it('names the entry a project archive is missing', () => {
    const t = ((key: string, params?: Record<string, unknown>) =>
      `${key} ${JSON.stringify(params ?? {})}`) as Translate;
    const missing = refused(
      new Uint8Array(
        // An empty ZIP: its end-of-central-directory record alone.
        [0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)],
      ),
    );
    expect(fileErrorText(missing, t)).toBe('file.entryMissing {"entry":"manifest.json"}');
  });
});

describe('every refusal is worded in the app', () => {
  const cases: readonly [string, unknown][] = [
    ['not an archive', refused(NOT_A_ZIP)],
    ['a resource limit', new ResourceLimitError('entries', 9, 10)],
    ['a copy that is not one', catching(() => readFeatures('{'))],
    ['a missing file', overIpc("ENOENT: no such file or directory, open '/p/a.lcp'")],
    ['no permission', overIpc("EACCES: permission denied, open '/p/a.lcp'")],
    ['not permitted', overIpc("EPERM: operation not permitted, open '/p/a.lcp'")],
    ['a full disk', overIpc('ENOSPC: no space left on device, write')],
    ['a read-only disk', overIpc("EROFS: read-only file system, open '/p/a.lcp'")],
    ['a path nobody chose', overIpc(REFUSAL.notGranted)],
    ['a viewer for something not a PDF', overIpc(REFUSAL.notViewable)],
    ['the Trash for something not a project', overIpc(REFUSAL.notAProject)],
    ['a template that has gone', overIpc(REFUSAL.noSuchTemplate)],
    ['anything else', new TypeError('x is undefined')],
  ];

  it.each(cases)('%s, in another language, is that language’s', (_name, error) => {
    expect(fileErrorText(error, expanded)).toMatch(/^\[.*\]$/);
  });

  it('keeps an unexpected error’s own detail, inside the app’s words', () => {
    expect(fileErrorText(new TypeError('x is undefined'), english)).toBe(
      english('file.unexpected', { reason: 'x is undefined' }),
    );
  });

  it('keeps an operating system’s refusal it has no words for, without Electron’s wrapping', () => {
    expect(fileErrorText(overIpc('EIO: i/o error, read'), english)).toBe(
      english('file.unexpected', { reason: 'EIO: i/o error, read' }),
    );
  });
});

function catching(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('it did not throw');
}
