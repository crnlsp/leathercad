import { EPS_ANGLE } from '@leathercad/core';
import { arc, cubic, path, polyline, vec } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  documentTextItem,
  dotsItem,
  fillItem,
  foldTickItem,
  hatchItem,
  linkTickItem,
  markerItem,
  pathItem,
  slitsItem,
  textItem,
  type DisplayList,
} from '../displayList.js';
import { CANVAS, GROUND } from '../theme/index.js';
import type { ViewportView } from '../view.js';

import { renderToSvgString } from './backend.js';

const view: ViewportView = {
  centreMm: vec(0, 0),
  scale: 2,
  widthPx: 400,
  heightPx: 300,
  dpr: 1,
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

  it('splits a sweep within EPS_ANGLE of a full turn as a full circle', () => {
    const almost = path([arc(vec(0, 0), 10, 0, Math.PI * 2 - EPS_ANGLE / 2)], true);
    const svg = renderToSvgString(listOf(pathItem('cut', almost)), view);

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

    // 3 CSS pixels at 2 px/mm is 1.5 mm inside the scaled group.
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

describe('on a 2× display (U.1)', () => {
  // The document is the canvas's size in device pixels, and its user space is
  // CSS pixels: the viewBox is where the display's ratio is applied, once, so
  // every screen-constant size reads the same at any ratio.
  const at = (dpr: number): ViewportView => ({
    ...view,
    scale: view.scale * dpr,
    widthPx: view.widthPx * dpr,
    heightPx: view.heightPx * dpr,
    dpr,
  });
  const scene = listOf(
    pathItem('cut', polyline([vec(-20, -10), vec(20, -10), vec(20, 10), vec(-20, 10)], true)),
    pathItem('stitch', path([arc(vec(0, 0), 8, 0, Math.PI)])),
    pathItem('construction', polyline([vec(0, 0), vec(5, 5)]), { dashPx: [4, 3] }),
    dotsItem('stitch-holes', [vec(-8, 0), vec(8, 0)], 2, '#5aa9ff'),
    slitsItem([[vec(0, 0), vec(1, 1)]], 1.25),
    hatchItem(polyline([vec(0, 0), vec(4, 0), vec(4, 4)], true)),
    foldTickItem(vec(0, 0), 'valley'),
    linkTickItem('stitch', vec(0, 0), vec(1, 0)),
    textItem('annotation', vec(0, 12), '40 mm', 11),
    documentTextItem('annotation', vec(0, -14), 'A', 4),
    markerItem(vec(3, 3), 'error', '#c0392f', true),
  );

  it('is as many device pixels as the canvas, over a viewBox of its CSS pixels', () => {
    const svg = renderToSvgString(listOf(), at(2));
    expect(svg).toContain('width="800" height="600" viewBox="0 0 400 300"');
  });

  it('draws everything as it would at 1×, only twice as sharp', () => {
    fc.assert(
      fc.property(fc.constantFrom(2, 4), (dpr) => {
        // Ratios that scale a float exactly, so the two documents can be
        // compared character for character below the root element.
        const one = renderToSvgString(scene, view).split('\n');
        const other = renderToSvgString(scene, at(dpr)).split('\n');
        expect(other.slice(1)).toEqual(one.slice(1));
      }),
    );
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

describe('the leather marks (F.7), as the canvas draws them', () => {
  const square = polyline([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], true);

  it('draws slits as one path of separate strokes, with butt caps', () => {
    const svg = renderToSvgString(
      listOf(
        slitsItem(
          [
            [vec(0, 0), vec(1, 1)],
            [vec(4, 0), vec(5, 1)],
          ],
          1.25,
        ),
      ),
      view,
    );
    expect(svg).toContain('d="M 0 0 L 1 1 M 4 0 L 5 1"');
    expect(svg).toContain('stroke-linecap="butt"');
  });

  it('fills a band even-odd, inside the world group', () => {
    const inner = polyline([vec(2, 2), vec(8, 2), vec(8, 8)], true);
    const svg = renderToSvgString(listOf(fillItem('cut', [square, inner], CANVAS.allowance)), view);
    expect(svg).toMatch(new RegExp(`fill="${CANVAS.allowance}" fill-rule="evenodd"`));
  });

  it('clips a hatch to its cut-out with a clip path of its own', () => {
    const svg = renderToSvgString(listOf(hatchItem(square), hatchItem(square)), view);
    const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(svg).toContain(`clip-path="url(#${ids[0]!})"`);
    expect(svg).toContain(`stroke="${CANVAS.hatch.colour}"`);
  });

  it('draws a fold tick as an upright chevron and a link tick as two rings', () => {
    const svg = renderToSvgString(
      listOf(foldTickItem(vec(0, 0), 'mountain'), linkTickItem('stitch', vec(0, 0), vec(1, 0))),
      view,
    );
    // The world origin is the canvas centre, (200, 150): a Λ, apex above.
    const w = CANVAS.foldTick.widthPx / 2;
    const h = CANVAS.foldTick.heightPx / 2;
    expect(svg).toContain(
      `<polyline points="${200 - w},${150 + h} 200,${150 - h} ${200 + w},${150 + h}"`,
    );
    expect(svg.match(/<circle [^>]*data-glyph="link"/g)).toHaveLength(2);
    expect(svg).toContain(`fill="${GROUND.ground}"`);
  });
});
