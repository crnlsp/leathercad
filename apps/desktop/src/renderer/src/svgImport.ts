import { ResourceLimitError } from '@leathercad/core';
import { emptyDocument, importPieces, type DrawnPiece } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import {
  assignRoles,
  importSvg,
  SvgImportError,
  type SvgElement,
  type SvgGeometry,
  type SvgPattern,
} from '@leathercad/import';

import type { I18n } from '../../shared/i18n.js';

/** Pixels to the inch a unitless file is read at (9.20): Inkscape's, or Illustrator's. */
export type Density = 96 | 72;
export const DENSITIES: readonly Density[] = [96, 72];

const INKSCAPE = [
  'http://www.inkscape.org/namespaces/inkscape',
  'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
];

/**
 * The density a file names by who wrote it: Inkscape's own attributes on the
 * root say 96. Otherwise none — the maker is asked, never guessed for.
 */
export function densityOf(tree: SvgElement): Density | null {
  return tree.attributes.some((a) => INKSCAPE.includes(a.namespace)) ? 96 : null;
}

/** What the preview shows of a file, at a density or by its own units. */
export type SvgReading =
  | { readonly kind: 'needs-density' }
  | { readonly kind: 'refused'; readonly error: SvgImportError | ResourceLimitError }
  | {
      readonly kind: 'read';
      /** `file` when the file's own units set the size; else the density read at. */
      readonly scale: 'file' | Density;
      readonly pattern: SvgPattern;
      /** Elements the conversion did not read, by name. */
      readonly omitted: Readonly<Record<string, number>>;
      readonly pieces: readonly DrawnPiece[];
      /** The pieces made into a project, as the import will make them: what the preview draws. */
      readonly project: Project;
    };

/**
 * Reads a parsed file into pieces (9.20b). By its own units when it has
 * them; else at `density`, and asks for one when that is null too. A file
 * that cannot be read is a refusal the dialog words.
 */
export function readSvg(tree: SvgElement, name: string, density: Density | null): SvgReading {
  try {
    let scale: 'file' | Density = 'file';
    let geometry: SvgGeometry;
    try {
      geometry = importSvg(tree);
    } catch (error) {
      if (!(error instanceof SvgImportError && error.code === 'SCALE_REQUIRED')) throw error;
      if (density === null) return { kind: 'needs-density' };
      scale = density;
      geometry = importSvg(tree, { pixelsPerInch: density });
    }
    const pattern = assignRoles(geometry.shapes);
    const pieces = pattern.pieces.map((piece, i): DrawnPiece => ({
      ...piece,
      // The file's name names its pieces: data, never the interface's words.
      name: pattern.pieces.length === 1 ? name : `${name} ${String(i + 1)}`,
    }));
    let n = 0;
    const project = importPieces(pieces, () => `preview-${String(n++)}`).command.apply(
      emptyDocument('preview'),
    ).project;
    return { kind: 'read', scale, pattern, omitted: geometry.omitted, pieces, project };
  } catch (error) {
    if (error instanceof SvgImportError || error instanceof ResourceLimitError)
      return { kind: 'refused', error };
    throw error;
  }
}

/** A file's name without its folder or its `.svg`: what its pieces are named. */
export function svgName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.svg$/i, '');
}

/** What each piece holds, in the maker's words: `1 cut-out, 1 fold and 2 markings`. */
export function contentsText(pieces: readonly DrawnPiece[], { t, list }: I18n): string | null {
  const total = (of: (piece: DrawnPiece) => readonly unknown[]): number =>
    pieces.reduce((sum, piece) => sum + of(piece).length, 0);
  const parts = [
    ['svgImport.cutOuts', total((p) => p.cutOuts)],
    ['svgImport.stitchLines', total((p) => p.stitchLines)],
    ['svgImport.folds', total((p) => p.foldLines)],
    ['svgImport.markings', total((p) => p.markings)],
  ] as const;
  const said = parts.flatMap(([key, count]) => (count === 0 ? [] : [t(key, { count })]));
  return said.length === 0 ? null : list(said);
}

/** The left-out kinds said in words, each with what became of it (9.20c); others by name. */
const KINDS = [
  'text',
  'image',
  'use',
  'foreignObject',
  'script',
  'filter',
  'clipPath',
  'mask',
] as const;
const isKind = (name: string): name is (typeof KINDS)[number] =>
  (KINDS as readonly string[]).includes(name);

/** What was left out, by kind and count, one line each. */
export function leftOutLines(
  reading: Extract<SvgReading, { kind: 'read' }>,
  { t }: I18n,
): string[] {
  return [
    ...Object.entries(reading.omitted).map(([name, count]) =>
      isKind(name)
        ? t(`svgImport.leftOut.kinds.${name}`, { count })
        : t('svgImport.leftOut.element', { name, count }),
    ),
    ...Object.entries(reading.pattern.leftOut).map(([reason, count]) =>
      t(`svgImport.leftOut.${reason as keyof SvgPattern['leftOut']}`, { count }),
    ),
  ];
}

/** Why a drawing could not be imported, in the maker's words. */
export function refusalText(error: SvgImportError | ResourceLimitError, { t }: I18n): string {
  if (error instanceof SvgImportError) return t(`svgImport.refused.${error.code}`);
  const megabytes = error.limit / 2 ** 20;
  switch (error.resource) {
    case 'svgBytes':
      return t('svgImport.refused.svgBytes', { limit: megabytes });
    case 'svgExpandedBytes':
      return t('svgImport.refused.svgExpandedBytes', { limit: megabytes });
    case 'segments':
      return t('svgImport.refused.segments', { limit: error.limit });
    case 'svgShapeTests':
      return t('svgImport.refused.svgShapeTests');
    default:
      return t('svgImport.refused.tooBig', { limit: error.limit });
  }
}
