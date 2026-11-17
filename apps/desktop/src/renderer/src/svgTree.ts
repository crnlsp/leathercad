import { checkResourceLimit } from '@leathercad/core';
import { SvgImportError, type SvgElement } from '@leathercad/import';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * An SVG file's bytes as the plain tree `packages/import` converts (ADR 0023,
 * steps 3, 5–7). Decoded strictly — invalid UTF-8 is refused, never replaced —
 * and parsed by the platform. The parsed document is walked once, never
 * adopted into the window or shown, and dropped: only elements and their
 * attributes cross, each counted against PERF-012's node ceiling.
 *
 * The byte ceiling and the entity check before parsing (steps 2 and 4) are
 * 9.20c's, with the hostile-file corpus that tests them.
 *
 * Tested end to end: `DOMParser` is not in Node (`e2e/svg-import.spec.ts`).
 */
export function svgTree(bytes: Uint8Array): SvgElement {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SvgImportError('INVALID_SVG');
  }
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (
    document.getElementsByTagName('parsererror').length > 0 ||
    root.namespaceURI !== SVG ||
    root.localName !== 'svg'
  )
    throw new SvgImportError('INVALID_SVG');

  interface Built extends SvgElement {
    readonly children: SvgElement[];
  }
  const plain = (element: Element): Built => ({
    namespace: element.namespaceURI ?? '',
    localName: element.localName,
    attributes: Array.from(element.attributes, (a) => ({
      namespace: a.namespaceURI ?? '',
      localName: a.localName,
      value: a.value,
    })),
    children: [],
  });
  const tree = plain(root);
  const stack: [Element, Built][] = [[root, tree]];
  let count = 1;
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [element, built] = next;
    for (const child of Array.from(element.children)) {
      checkResourceLimit('nodes', ++count);
      const copy = plain(child);
      built.children.push(copy);
      stack.push([child, copy]);
    }
  }
  return tree;
}
