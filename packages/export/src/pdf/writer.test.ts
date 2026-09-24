import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_SETTINGS,
  ORIENTATIONS,
  PAPER_NAMES,
  evaluate,
  type Orientation,
  type Project,
  type ProjectSettings,
} from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { PDFDocument, PDFName, type PDFDict } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SETUP,
  contentAreaMm,
  mmToPt,
  pageSetupFor,
  sheetSizeMm,
  verificationLayout,
} from '../paper.js';
import { buildExportScene } from '../scene.js';
import { exportPdf } from './writer.js';

const FIXED_NOW = (): Date => new Date('2026-09-04T12:00:00.000Z');

/** A panel, its derived stitch line, and the holes along it. */
function projectWithStitching(
  widthMm: number,
  heightMm: number,
  insetMm: number,
  pitchMm: number,
): Project {
  const base = projectWithRect(widthMm, heightMm);
  const part = base.parts[0]!;

  return {
    ...base,
    parts: [
      {
        ...part,
        features: [
          ...part.features,
          {
            id: 'stitch-1',
            kind: 'stitch-line',
            name: 'Stitch line',
            // Hidden so the measurement sees only the holes. The dashed line
            // runs through the same pixels they sit on, and its 2 mm dashes
            // are close enough in size to a hole marker to be mistaken for
            // one. A hidden feature still derives; it just does not print.
            visible: false,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'feat-1',
              op: { type: 'offset', distanceMm: insetMm, side: 'inward', run: { kind: 'whole' } },
            },
          },
          {
            id: 'holes-1',
            kind: 'stitch-hole-set',
            name: 'Stitch holes',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: 'stitch-1',
              op: {
                type: 'stitch-holes',
                pitchMm,
                mode: 'fit-whole',
                corners: 'hole-at-corner',
              },
            },
          },
        ],
      },
    ],
  };
}

function projectWithRect(widthMm: number, heightMm: number, radius = 0): Project {
  return {
    id: 'p',
    name: 'Test pattern',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part-1',
        name: 'Panel',
        quantity: 1,
        features: [
          {
            id: 'feat-1',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: widthMm,
                height: heightMm,
                radii: uniformRadii(radius),
                rotation: 0,
              },
            },
          },
        ],
      },
    ],
  };
}

async function pdfFor(project: Project): Promise<Uint8Array> {
  const scene = buildExportScene(evaluate(project), project.name);
  const { bytes } = await exportPdf(scene, {
    // What the application passes: the project's own paper, not a fallback.
    setup: pageSetupFor(project.settings),
    now: FIXED_NOW,
    applicationVersion: 'test',
  });
  return bytes;
}

/** The same project, printed on different paper. */
function on(project: Project, paper: ProjectSettings['paper'], orientation: Orientation): Project {
  return { ...project, settings: { ...project.settings, paper, orientation } };
}

describe('text on paper', () => {
  /** The name of every part in the project, and the project itself, renamed. */
  function renamed(project: Project, name: string): Project {
    return {
      ...project,
      name,
      parts: project.parts.map((part) => ({ ...part, name })),
    };
  }

  it('exports a part named in Polish, which is why typography was vendored', async () => {
    // The live defect ADR 0011 was written for: pdf-lib's standard fonts are
    // WinAnsi, which has no ł, so `page.drawText` threw and the user could not
    // export their project at all. Outlines have no encoding to fall outside.
    const project = renamed(projectWithRect(80, 50), 'Przegroda główna');

    await expect(pdfFor(project)).resolves.toBeInstanceOf(Uint8Array);
  });

  it.each(['Pasek zapięcia', 'Łódź', 'Ćwiek', 'Żabka'])('exports a part named %s', async (name) => {
    await expect(pdfFor(renamed(projectWithRect(60, 40), name))).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it('embeds no font at all, in any page', async () => {
    // Every string is filled outlines. A cutter program that mishandles
    // embedded fonts has nothing to mishandle. pdf-lib gives every page an
    // empty /Font dictionary of its own accord; what matters is that nothing
    // is ever put in it.
    const bytes = await pdfFor(renamed(projectWithRect(80, 50), 'Przegroda główna'));
    const document = await PDFDocument.load(bytes);

    expect(document.getPages()).not.toHaveLength(0);
    for (const page of document.getPages()) {
      const fonts = page.node.Resources()?.get(PDFName.of('Font'));
      expect(fonts === undefined || (fonts as PDFDict).entries().length === 0).toBe(true);
    }
  });

  it('writes the caption as filled paths, so it is visibly on the page', async () => {
    const plain = await pdfFor(projectWithRect(80, 50));
    const longer = await pdfFor(renamed(projectWithRect(80, 50), 'A very much longer caption'));

    // More letters, more outlines, so a longer name makes a larger content
    // stream — the caption really is being drawn rather than dropped.
    expect(longer.byteLength).toBeGreaterThan(plain.byteLength);
  });
});

describe('text labels on paper', () => {
  function withLabel(text: string): Project {
    const base = projectWithRect(80, 50);
    const part = base.parts[0]!;
    return {
      ...base,
      parts: [
        {
          ...part,
          features: [
            ...part.features,
            {
              id: 'label-1',
              kind: 'text-label',
              name: text,
              visible: true,
              locked: false,
              source: { kind: 'text', text, at: { x: 10, y: 20 }, sizeMm: 4, rotationRad: 0 },
            },
          ],
        },
      ],
    };
  }

  it('puts a label in the scene as outlines, beside the part caption', () => {
    const scene = buildExportScene(evaluate(withLabel('Zszyć tutaj')), 'Test');
    const texts = scene.parts[0]!.texts;

    expect(texts.map((t) => t.source)).toEqual(['Panel', 'Zszyć tutaj']);
    expect(texts[1]!.glyphs.length).toBeGreaterThan(0);
    expect(texts[1]!.sizeMm).toBe(4);
  });

  it('prints it, and prints more of it for more words', async () => {
    const short = await pdfFor(withLabel('Fold'));
    const long = await pdfFor(withLabel('Fold before stitching, then glue'));

    expect(long.byteLength).toBeGreaterThan(short.byteLength);
  });

  it('does not put a hidden label on the sheet', async () => {
    const shown = withLabel('Fold');
    const hidden: Project = {
      ...shown,
      parts: shown.parts.map((part) => ({
        ...part,
        features: part.features.map((f) =>
          f.kind === 'text-label' ? { ...f, visible: false } : f,
        ),
      })),
    };

    const scene = buildExportScene(evaluate(hidden), 'Test');
    expect(scene.parts[0]!.texts.map((t) => t.source)).toEqual(['Panel']);
  });
});

describe('document structure', () => {
  it('sets the MediaBox to A4 in points, exactly', () => {
    // If this is wrong, everything downstream is wrong and nothing else can
    // detect it.
    return pdfFor(projectWithRect(100, 50)).then(async (bytes) => {
      const document = await PDFDocument.load(bytes);
      const [page] = document.getPages();
      expect(page!.getWidth()).toBeCloseTo(mmToPt(210), 4);
      expect(page!.getHeight()).toBeCloseTo(mmToPt(297), 4);
    });
  });

  it("prints on the paper the project names, not on the exporter's fallback", async () => {
    // The end of the chain that slice 5.5 exists for. Before it, every export
    // in the product was A4 portrait because `exportPdf` fell back to
    // `DEFAULT_PAGE_SETUP` and nothing ever passed one — so this asserts the
    // stored choice reaches the page, which is the only place it is visible.
    const project = projectWithRect(100, 50);

    for (const [paper, orientation, widthMm, heightMm] of [
      ['A5', 'portrait', 148, 210],
      ['A4', 'portrait', 210, 297],
      ['A4', 'landscape', 297, 210],
      ['A3', 'portrait', 297, 420],
      ['Letter', 'portrait', 215.9, 279.4],
    ] as const) {
      const document = await PDFDocument.load(await pdfFor(on(project, paper, orientation)));
      const [page] = document.getPages();

      expect(page!.getWidth(), `${paper} ${orientation}`).toBeCloseTo(mmToPt(widthMm), 4);
      expect(page!.getHeight(), `${paper} ${orientation}`).toBeCloseTo(mmToPt(heightMm), 4);
    }
  });

  it('produces one page for a pattern that fits', async () => {
    const document = await PDFDocument.load(await pdfFor(projectWithRect(100, 50)));
    expect(document.getPageCount()).toBe(1);
  });

  it('records the project name and a fixed creation date', async () => {
    const document = await PDFDocument.load(await pdfFor(projectWithRect(100, 50)));
    expect(document.getTitle()).toBe('Test pattern');
    expect(document.getCreationDate()?.toISOString()).toBe('2026-09-04T12:00:00.000Z');
  });

  it('asks viewers not to scale when printing', async () => {
    // One of three independent defences. The app never drives a printer, so
    // the file has to look after itself in someone else's viewer.
    //
    // Read back through the parser rather than grepping the bytes: pdf-lib
    // writes the catalog into a Flate-compressed object stream, so the name
    // never appears as plain text.
    const document = await PDFDocument.load(await pdfFor(projectWithRect(100, 50)));
    const preferences = document.catalog.getOrCreateViewerPreferences();
    expect(String(preferences.getPrintScaling())).toContain('None');
  });

  it('still writes a page for an empty project', async () => {
    const empty: Project = { id: 'p', name: 'Empty', settings: DEFAULT_SETTINGS, parts: [] };
    const document = await PDFDocument.load(await pdfFor(empty));
    expect(document.getPageCount()).toBe(1);
  });

  it('adds pages rather than shrinking when parts overflow', async () => {
    const project = projectWithRect(180, 120);
    const many: Project = {
      ...project,
      parts: Array.from({ length: 4 }, (_, i) => ({
        ...project.parts[0]!,
        id: `part-${i}`,
        features: [{ ...project.parts[0]!.features[0]!, id: `feat-${i}` }],
      })),
    };
    const document = await PDFDocument.load(await pdfFor(many));
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});

/**
 * Rasterises the PDF and measures the result in pixels.
 *
 * The strongest check available short of a steel rule: it renders through
 * poppler — a real, independent PDF implementation — and measures what a
 * printer would actually be sent. Parsing our own numbers back out only proves
 * we wrote what we meant to write; this proves the file means what we think.
 *
 * 254 dpi is exactly 10 pixels per millimetre, which keeps the arithmetic
 * honest.
 */
const DPI = 254;
const PX_PER_MM = DPI / 25.4;

/**
 * Whether poppler is installed.
 *
 * The rasterised checks are the strongest ones here, so CI installs
 * poppler-utils to make sure they run. A contributor without it still gets
 * every other test rather than a wall of failures.
 *
 * That skip is right on a laptop and wrong in CI: if the install step ever
 * breaks, the checks that prove a 100 mm line measures 100 mm would stop
 * running and the build would still report green. CI therefore sets
 * LEATHERCAD_REQUIRE_POPPLER, which turns the absence into a failure.
 */
const HAS_POPPLER = ((): boolean => {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    if (process.env['LEATHERCAD_REQUIRE_POPPLER'] !== undefined) {
      throw new Error(
        'LEATHERCAD_REQUIRE_POPPLER is set but pdftoppm was not found, so the ' +
          'rasterised print measurements cannot run. Install poppler-utils, or ' +
          'unset the variable to skip them.',
      );
    }
    return false;
  }
})();

interface Gray {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** Parses a binary PGM (P5). Chosen over PNG because it needs no decoder. */
function parsePgm(bytes: Buffer): Gray {
  let offset = 0;
  const token = (): string => {
    while (
      bytes[offset] === 0x20 ||
      bytes[offset] === 0x0a ||
      bytes[offset] === 0x0d ||
      bytes[offset] === 0x09
    ) {
      offset++;
    }
    if (bytes[offset] === 0x23) {
      while (bytes[offset] !== 0x0a) offset++;
      return token();
    }
    const start = offset;
    while (offset < bytes.length && bytes[offset]! > 0x20) offset++;
    return bytes.subarray(start, offset).toString('ascii');
  };

  const magic = token();
  if (magic !== 'P5') throw new Error(`expected a binary PGM, got ${magic}`);
  const width = Number(token());
  const height = Number(token());
  token(); // maxval
  offset++; // the single whitespace byte before the data

  return { width, height, pixels: new Uint8Array(bytes.subarray(offset, offset + width * height)) };
}

function render(bytes: Uint8Array): Gray {
  const directory = mkdtempSync(join(tmpdir(), 'leathercad-pdf-'));
  try {
    const pdfPath = join(directory, 'out.pdf');
    writeFileSync(pdfPath, bytes);
    execFileSync('pdftoppm', [
      '-r',
      String(DPI),
      '-gray',
      '-f',
      '1',
      '-l',
      '1',
      pdfPath,
      join(directory, 'page'),
    ]);
    return parsePgm(readFileSync(join(directory, 'page-1.pgm')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * The image rows covering the printable area.
 *
 * Derived from the page setup rather than guessed, so the scan follows the
 * layout instead of silently including the verification block.
 */
function contentRows(): [number, number] {
  const area = contentAreaMm(DEFAULT_PAGE_SETUP);
  const sheet = sheetSizeMm(DEFAULT_PAGE_SETUP);
  // Image rows run downward from the top of the page; millimetres run up.
  return [
    Math.floor((sheet.heightMm - (area.y + area.heightMm)) * PX_PER_MM),
    Math.ceil((sheet.heightMm - area.y) * PX_PER_MM),
  ];
}

/** Bounding box of dark pixels within a horizontal band of the image. */
/**
 * The x centres of the hole markers along one stitch run.
 *
 * Finds the row crossing the most holes, then projects a thin band around it
 * onto the columns: a hole is a circle *outline*, so a single row crosses it
 * twice and at a different width depending on where it cuts. Collapsing a band
 * into columns makes each hole one contiguous cluster whatever its height,
 * and the cluster's middle is its centre.
 */
function holeCentresAlongRow(image: Gray): number[] {
  const bandHalf = Math.round(0.4 * PX_PER_MM);
  let best: number[] = [];

  for (let y = bandHalf; y < image.height - bandHalf; y++) {
    const centres = clusterCentres(image, y - bandHalf, y + bandHalf);
    // Evenness is what identifies a stitch run. Without it the densest band on
    // the page is the footer text, which is also a row of millimetre-wide
    // marks — just not equally spaced ones.
    if (centres.length > best.length && evenlySpaced(centres)) best = centres;
  }

  return best;
}

function evenlySpaced(centres: readonly number[]): boolean {
  if (centres.length < 8) return false;

  const gaps: number[] = [];
  for (let i = 1; i < centres.length; i++) gaps.push(centres[i]! - centres[i - 1]!);

  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  return gaps.every((gap) => Math.abs(gap - median) < 0.15 * PX_PER_MM);
}

/** Contiguous dark columns in a row band, as centres, ignoring thin strokes. */
function clusterCentres(image: Gray, fromRow: number, toRow: number): number[] {
  const centres: number[] = [];
  let runStart = -1;

  for (let x = 0; x <= image.width; x++) {
    let dark = false;
    if (x < image.width) {
      for (let y = fromRow; y <= toRow && !dark; y++) {
        if (image.pixels[y * image.width + x]! < 128) dark = true;
      }
    }

    if (dark && runStart < 0) runStart = x;
    if (!dark && runStart >= 0) {
      const width = x - runStart;
      // A 1 mm hole marker. The outline is a 0.25 mm stroke and the stitch
      // line a dashed 0.15 mm one — both far narrower, and a long horizontal
      // edge is far wider.
      if (width > 0.5 * PX_PER_MM && width < 2 * PX_PER_MM) {
        centres.push(runStart + width / 2);
      }
      runStart = -1;
    }
  }

  return centres;
}

function darkBounds(image: Gray, fromRow: number, toRow: number, fromColumn = 0) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = fromRow; y < Math.min(toRow, image.height); y++) {
    for (let x = fromColumn; x < image.width; x++) {
      if (image.pixels[y * image.width + x]! < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, found: maxX >= minX };
}

describe.skipIf(!HAS_POPPLER)('rendered output', () => {
  it('renders an A4 page at exactly the right pixel size', async () => {
    const image = render(await pdfFor(projectWithRect(100, 50)));
    // 210 mm and 297 mm at 10 px/mm. Poppler rounds the canvas up by a pixel,
    // which says nothing about the geometry inside it.
    expect(Math.abs(image.width - 210 * PX_PER_MM)).toBeLessThanOrEqual(1);
    expect(Math.abs(image.height - 297 * PX_PER_MM)).toBeLessThanOrEqual(1);
  });

  it('draws a 100 mm line as 100 mm on the page', async () => {
    // The product promise, measured. A scaling transform anywhere in the
    // pipeline shows up here and nowhere else.
    const image = render(await pdfFor(projectWithRect(100, 50)));

    const bounds = darkBounds(image, ...contentRows());
    expect(bounds.found).toBe(true);

    const widthMm = (bounds.maxX - bounds.minX) / PX_PER_MM;
    // Within a fifth of a millimetre, which is the stroke width plus one pixel.
    expect(widthMm).toBeGreaterThan(99.8);
    expect(widthMm).toBeLessThan(100.4);
  });

  it('draws a 50 mm verification square that measures 50 mm', async () => {
    // The user's backstop against a scaled print, so it had better be 50 mm.
    const image = render(await pdfFor(projectWithRect(100, 50)));

    // Look only where the square is. The band below the content area also
    // holds the warning text and the page footer, both of which reach further
    // right than the square does.
    const sheet = sheetSizeMm(DEFAULT_PAGE_SETUP);
    const squareBottomMm = DEFAULT_PAGE_SETUP.marginsMm.bottom + 8;
    const bounds = darkBounds(
      image,
      Math.floor((sheet.heightMm - (squareBottomMm + 52)) * PX_PER_MM),
      Math.ceil((sheet.heightMm - squareBottomMm + 1) * PX_PER_MM),
      Math.round(115 * PX_PER_MM),
    );
    expect(bounds.found).toBe(true);

    const widthMm = (bounds.maxX - bounds.minX) / PX_PER_MM;
    const heightMm = (bounds.maxY - bounds.minY) / PX_PER_MM;
    expect(widthMm).toBeGreaterThan(49.8);
    expect(widthMm).toBeLessThan(50.4);
    expect(heightMm).toBeGreaterThan(49.8);
    expect(heightMm).toBeLessThan(50.4);
  });

  it.each(
    PAPER_NAMES.flatMap((paper) =>
      ORIENTATIONS.map((orientation) => [paper, orientation] as const),
    ),
  )('prints the 50 mm square on %s %s, where the layout puts it', async (paper, orientation) => {
    // Regression: on A5 portrait the square was skipped, on a page that still
    // told the maker to measure it. Measured through poppler on every sheet a
    // maker can choose, at the place `verificationLayout` gives.
    const project = on(projectWithRect(100, 50), paper, orientation);
    const setup = pageSetupFor(project.settings);
    const { square, squareSizeMm } = verificationLayout(setup);
    const sheet = sheetSizeMm(setup);
    const image = render(await pdfFor(project));

    const bounds = darkBounds(
      image,
      Math.floor((sheet.heightMm - (square.y + squareSizeMm + 2)) * PX_PER_MM),
      Math.ceil((sheet.heightMm - square.y + 1) * PX_PER_MM),
      Math.round((square.x - 1) * PX_PER_MM),
    );
    expect(bounds.found).toBe(true);
    expect((bounds.maxX - bounds.minX) / PX_PER_MM).toBeGreaterThan(49.8);
    expect((bounds.maxX - bounds.minX) / PX_PER_MM).toBeLessThan(50.4);
    expect((bounds.maxY - bounds.minY) / PX_PER_MM).toBeGreaterThan(49.8);
    expect((bounds.maxY - bounds.minY) / PX_PER_MM).toBeLessThan(50.4);
  });

  it('keeps the pattern clear of the verification block', async () => {
    // Regression: the square ran from 18 mm to 68 mm above the page bottom
    // while the content area began at 36 mm, so a part could be printed
    // straight over the thing that proves the scale is right.
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    const squareTopMm = DEFAULT_PAGE_SETUP.marginsMm.bottom + 8 + 50;
    expect(area.y).toBeGreaterThan(squareTopMm);
  });

  it('scales a 200 mm pattern to 200 mm, not to the page', async () => {
    // A pattern nearly filling the width is where a "fit to page" bug would
    // be most tempting and least visible.
    const image = render(await pdfFor(projectWithRect(180, 100)));
    const bounds = darkBounds(image, ...contentRows());
    const widthMm = (bounds.maxX - bounds.minX) / PX_PER_MM;
    expect(widthMm).toBeGreaterThan(179.8);
    expect(widthMm).toBeLessThan(180.4);
  });

  it('prints stitch holes at the pitch they were generated for', async () => {
    // The measurement that matters for stitching: it is not enough that the
    // model says 3.85 mm, the holes have to land 3.85 mm apart on the paper.
    // Rasterising asks an independent renderer what a printer would be sent.
    const project = projectWithStitching(100, 60, 3.5, 4);
    const image = render(await pdfFor(project));

    // A horizontal band through the middle of the bottom stitch run, clear of
    // the outline and of the corner holes at either end.
    const holes = holeCentresAlongRow(image);
    expect(holes.length).toBeGreaterThan(15);

    const gaps: number[] = [];
    for (let i = 1; i < holes.length; i++) gaps.push((holes[i]! - holes[i - 1]!) / PX_PER_MM);

    const mean = gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
    // The run divides evenly at close to the nominal pitch, and every gap is
    // within a tenth of a millimetre of its neighbours.
    expect(mean).toBeGreaterThan(3.7);
    expect(mean).toBeLessThan(4.1);
    for (const gap of gaps) expect(Math.abs(gap - mean)).toBeLessThan(0.1);
  });

  it('renders a rounded corner as an arc, not a mitre', async () => {
    // PDF has no arc primitive, so this exercises the tolerance-driven
    // arc-to-cubic conversion all the way through to pixels.
    const image = render(await pdfFor(projectWithRect(100, 50, 10)));
    const bounds = darkBounds(image, ...contentRows());

    // Measured along the bottom edge: the part's printed name sits above the
    // shape, so the top of the dark bounds is the label, not the outline.
    //
    // With a 10 mm radius the extreme corner is blank while the middle of the
    // edge is inked. A mitred corner would ink both.
    const corner = image.pixels[(bounds.maxY - 2) * image.width + bounds.minX + 2]!;
    const midEdge =
      image.pixels[(bounds.maxY - 1) * image.width + Math.round((bounds.minX + bounds.maxX) / 2)]!;
    expect(corner).toBeGreaterThan(200);
    expect(midEdge).toBeLessThan(128);
  });
});
