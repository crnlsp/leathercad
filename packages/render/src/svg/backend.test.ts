import { arc, cubic, path, polyline, vec } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  documentTextItem,
  dotsItem,
  pathItem,
  textItem,
  type DisplayList,
} from '../displayList.js';
import type { ViewportView } from '../view.js';

import { renderToSvgString } from './backend.js';

const view: ViewportView = {
  centreMm: vec(0, 0),
  scale: 2,
  widthPx: 400,
  heightPx: 300,
};

const listOf = (...items: DisplayList['items']): DisplayList => ({ items });

describe('renderToSvgString', () => {
  it('sizes the document from the viewport', () => {
    const svg = renderToSvgString(listOf(), view);

    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('viewBox="0 0 400 300"');
  });

  it('emits a path in millimetres inside the world transform', () => {
    const svg = renderToSvgString(
      listOf(pathItem('cut', polyline([vec(0, 0), vec(10, 0), vec(10, 5)]))),
      view,
    );

    // Millimetres, not pixels: the group transform does the conversion, so a
    // snapshot diff reads in the units the user typed.
    expect(svg).toContain('d="M 0 0 L 10 0 L 10 5"');
    expect(svg).toContain('matrix(2 0 0 -2 200 150)');
  });

  it('closes a closed path with Z', () => {
    const svg = renderToSvgString(
      listOf(pathItem('cut', polyline([vec(0, 0), vec(10, 0), vec(10, 10)], true))),
      view,
    );

    expect(svg).toContain('Z"');
  });

  it('emits arcs as arc commands rather than flattening them', () => {
    const quarter = path([arc(vec(0, 0), 10, 0, Math.PI / 2)]);
    const svg = renderToSvgString(listOf(pathItem('cut', quarter)), view);

    // A 10 mm quarter arc: radii 10, not a large arc, positive sweep.
    expect(svg).toMatch(/A 10 10 0 0 1 /);
  });

  it('splits a full circle, which one arc command cannot express', () => {
    const full = path([arc(vec(0, 0), 10, 0, Math.PI * 2)], true);
    const svg = renderToSvgString(listOf(pathItem('cut', full)), view);

    // Start and end coincide, so SVG would draw nothing at all.
    expect(svg.match(/A /g)).toHaveLength(2);
  });

  it('emits cubics as curve commands', () => {
    const c = path([cubic(vec(0, 0), vec(0, 10), vec(10, 10), vec(10, 0))]);

    expect(renderToSvgString(listOf(pathItem('cut', c)), view)).toContain('C 0 10 10 10 10 0');
  });

  it('divides stroke width by the scale so it stays constant on screen', () => {
    const svg = renderToSvgString(
      listOf(pathItem('cut', polyline([vec(0, 0), vec(1, 0)]), { widthPx: 3 })),
      view,
    );

    // 3 device pixels at 2 px/mm is 1.5 mm inside the scaled group.
    expect(svg).toContain('stroke-width="1.5"');
  });

  it('divides the dash pattern by the scale too', () => {
    const svg = renderToSvgString(
      listOf(pathItem('cut', polyline([vec(0, 0), vec(1, 0)]), { dashPx: [4, 2] })),
      view,
    );

    expect(svg).toContain('stroke-dasharray="2 1"');
  });

  it('emits dots as circles with a screen-constant radius', () => {
    const svg = renderToSvgString(listOf(dotsItem('stitch-holes', [vec(3, 4)], 5, '#fff')), view);

    expect(svg).toContain('cx="3"');
    expect(svg).toContain('cy="4"');
    expect(svg).toContain('r="2.5"');
  });

  it('places text in screen space so the Y flip does not mirror it', () => {
    const svg = renderToSvgString(listOf(textItem('annotation', vec(0, 0), '100 mm', 12)), view);

    // The world origin sits at the centre of a 400 x 300 canvas.
    expect(svg).toContain('x="200"');
    expect(svg).toContain('y="150"');
    expect(svg).toContain('>100 mm<');
  });

  it('escapes text that would otherwise break the document', () => {
    const svg = renderToSvgString(
      listOf(textItem('annotation', vec(0, 0), 'a < b & "c"', 12)),
      view,
    );

    expect(svg).toContain('a &lt; b &amp; &quot;c&quot;');
    expect(svg).not.toContain('a < b & "c"');
  });

  it('rounds coordinates so a snapshot cannot churn on the last bit', () => {
    const svg = renderToSvgString(
      listOf(pathItem('cut', polyline([vec(1 / 3, 0), vec(10, 0)]))),
      view,
    );

    expect(svg).toContain('M 0.3333 0');
  });

  it('is deterministic', () => {
    const list = listOf(
      pathItem('cut', polyline([vec(0, 0), vec(10, 0)], true)),
      dotsItem('stitch-holes', [vec(1, 1)], 3, '#fff'),
      textItem('annotation', vec(0, 0), 'x', 10),
    );

    expect(renderToSvgString(list, view)).toBe(renderToSvgString(list, view));
  });

  it('matches its snapshot — the mechanism docs/testing.md §5.1 depends on', () => {
    const scene = listOf(
      pathItem('cut', polyline([vec(-20, -10), vec(20, -10), vec(20, 10), vec(-20, 10)], true)),
      pathItem('stitch', path([arc(vec(0, 0), 8, 0, Math.PI)])),
      dotsItem('stitch-holes', [vec(-8, 0), vec(0, 0), vec(8, 0)], 2, '#5aa9ff'),
      textItem('annotation', vec(0, 12), '40 mm', 11),
    );

    expect(renderToSvgString(scene, view)).toMatchSnapshot();
  });
});

describe('document text', () => {
  it('emits glyph outlines as filled paths, not a <text> element', () => {
    // ADR 0011: no font is referenced, so every viewer and cutter program
    // shows the same shapes, and this snapshot compares numbers.
    const svg = renderToSvgString(listOf(documentTextItem('annotation', vec(0, 0), 'Ab', 4)), view);

    expect(svg).not.toContain('<text');
    expect(svg).toMatch(/<path d="M [-0-9.]+ [-0-9.]+[^"]*" fill="/);
  });

  it('draws a character the typeface lacks rather than dropping it', () => {
    const svg = renderToSvgString(listOf(documentTextItem('annotation', vec(0, 0), '漢', 4)), view);
    expect(svg).toContain('fill="');
  });

  it('puts the outlines in the world group, in millimetres', () => {
    const svg = renderToSvgString(
      listOf(documentTextItem('annotation', vec(100, 50), 'A', 4)),
      view,
    );

    // Inside the transformed group, so the glyph is positioned in millimetres
    // like the geometry rather than in pixels like a readout.
    const worldGroup = svg.slice(svg.indexOf('<g transform='), svg.indexOf('</g>'));
    expect(worldGroup).toContain('<path');
    expect(worldGroup).toMatch(/M 10[0-9.]+ /);
  });
});
