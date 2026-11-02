import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESOURCE_LIMITS, ResourceLimitError } from '@leathercad/core';
import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { loadProject, readManifest, saveProject } from './lcp.js';

const saved = () =>
  saveProject(
    { id: 'p', name: '', settings: DEFAULT_SETTINGS, parts: [] },
    {
      now: () => new Date('2026-01-01T00:00:00Z'),
      applicationVersion: '1.5.0',
    },
  );

// Change central-directory metadata only: the regression must not allocate a ZIP bomb.
function excessiveHeader(): Uint8Array {
  const bytes = saved();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, RESOURCE_LIMITS.expandedBytes + 1, true);
      return bytes;
    }
  }
  throw new Error('fixture has no central directory');
}

describe('bounded archive expansion (PERF-012)', () => {
  it.each([loadProject, readManifest])(
    'refuses advertised expansion before decompressing (%s)',
    (read) => {
      expect(() => read(excessiveHeader())).toThrowError(ResourceLimitError);
    },
  );

  it('does not decompress unused entries', () => {
    const bytes = zipSync({ ...unzipSync(saved()), 'unused.bin': strToU8('unused') });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();
    for (let i = 0; i <= bytes.length - 46; i++) {
      const signature = view.getUint32(i, true);
      if (
        signature === 0x04034b50 &&
        decoder.decode(bytes.subarray(i + 30, i + 40)) === 'unused.bin'
      )
        view.setUint16(i + 8, 99, true);
      if (
        signature === 0x02014b50 &&
        decoder.decode(bytes.subarray(i + 46, i + 56)) === 'unused.bin'
      )
        view.setUint16(i + 10, 99, true);
    }
    // Unsupported compression would fail if this unused entry were inflated.
    expect(loadProject(bytes).project.parts).toEqual([]);
  });
});

it('bounds actual expansion even when both headers lie about the size', () => {
  // 32 MiB of zeros compress to a few KiB; at most one input chunk expands
  // beyond the ceiling before it is refused. No unbounded bomb is generated.
  const bytes = zipSync({ 'document.json': new Uint8Array(RESOURCE_LIMITS.expandedBytes + 1) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 30; i++) {
    const signature = view.getUint32(i, true);
    if (signature === 0x04034b50) view.setUint32(i + 22, 1, true);
    if (signature === 0x02014b50) view.setUint32(i + 24, 1, true);
  }
  expect(() => loadProject(bytes)).toThrowError(ResourceLimitError);
});

it('refuses a flipped compressed-size byte in v12 with a resource error (seed 530817745)', () => {
  const bytes = new Uint8Array(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/format/v12.lcp')),
  );
  const at = 263301872 % bytes.length;
  bytes[at] = (bytes[at] ?? 0) ^ 2;
  expect(() => loadProject(bytes)).toThrowError(ResourceLimitError);
});

it('bounds the sum of advertised expanded sizes, not just each entry', () => {
  const bytes = saved();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 12 * 1024 * 1024, true);
  }
  expect(() => loadProject(bytes)).toThrowError(ResourceLimitError);
});

it('bounds aggregate document values, including unknown metadata, before schema cloning', () => {
  const project = {
    id: 'p',
    name: '',
    settings: DEFAULT_SETTINGS,
    parts: [],
    extra: Array.from({ length: RESOURCE_LIMITS.nodes }, () => 0),
  };
  const bytes = saveProject(project, {
    applicationVersion: 'test',
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  expect(() => loadProject(bytes)).toThrowError(ResourceLimitError);
});
