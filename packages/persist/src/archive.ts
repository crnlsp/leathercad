import { checkResourceLimit } from '@leathercad/core';
import { Unzip, UnzipInflate, unzipSync } from 'fflate';

/**
 * Bound both the ZIP's advertised sizes and its actual expansion (PERF-012).
 * A 1 KiB compressed chunk can expand by about 1032× in DEFLATE. Streaming
 * therefore bounds transient output as well as retained bytes, even when a
 * file lies about its size. Unknown entries are never expanded.
 */
export function readArchive(
  bytes: Uint8Array,
  wanted: readonly string[],
): Record<string, Uint8Array> {
  checkResourceLimit('archiveBytes', bytes.byteLength);
  let declared = 0;
  let entries = 0;
  // Read the central directory without allocating any entry's contents.
  unzipSync(bytes, {
    filter: (entry) => {
      checkResourceLimit('entries', ++entries);
      declared += entry.originalSize;
      checkResourceLimit('expandedBytes', declared);
      checkResourceLimit('archiveBytes', entry.size);
      return false;
    },
  });

  const result: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  const found = new Set<string>();
  let expanded = 0;
  let localEntries = 0;
  const unzip = new Unzip((file) => {
    checkResourceLimit('entries', ++localEntries);
    if (!wanted.includes(file.name)) return;
    if (found.has(file.name)) throw new Error('Duplicate project archive entry');
    found.add(file.name);
    if (file.originalSize !== undefined) checkResourceLimit('expandedBytes', file.originalSize);
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, chunk, final) => {
      if (error !== null) throw error;
      expanded += chunk.byteLength;
      checkResourceLimit('expandedBytes', expanded);
      length += chunk.byteLength;
      chunks.push(chunk);
      if (final) {
        const joined = new Uint8Array(length);
        let offset = 0;
        for (const part of chunks) {
          joined.set(part, offset);
          offset += part.length;
        }
        result[file.name] = joined;
        chunks.length = 0;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const chunkSize = 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    unzip.push(bytes.subarray(offset, offset + chunkSize), offset + chunkSize >= bytes.length);
  }
  return result;
}

/** Bound JSON traversal before migrations or zod clone any nested arrays. */
export function checkJsonSize(value: unknown): void {
  const stack: unknown[] = [value];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    checkResourceLimit('nodes', ++nodes);
    if (current !== null && typeof current === 'object') {
      const children: unknown[] = Object.values(current);
      checkResourceLimit('nodes', nodes + stack.length + children.length);
      for (const child of children) stack.push(child);
    }
  }
}
