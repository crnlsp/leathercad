import { THREAD_ROUND_MM, THREAD_STITCH_FACTOR, type ProductionSummary } from '@leathercad/domain';

import type { I18n } from '../../shared/i18n.js';

/** One row of the summary, in words: what Properties shows and *Copy* writes. */
export interface ProductionRow {
  readonly id: 'pieces' | 'holes' | 'hardware' | 'thread' | 'leather';
  readonly label: string;
  readonly value: string;
  /** What stands under the value: the pieces, the hardware, the rule of an estimate. */
  readonly details: readonly string[];
}

/** mm² as the cm² and dm² a maker prices leather in. */
const MM2_PER_CM2 = 100;
const CM2_PER_DM2 = 100;
const MM_PER_M = 1000;

const roundTo = (value: number, places: number) => Number(value.toFixed(places));
const metresOf = (summary: ProductionSummary) => roundTo(summary.threadMm / MM_PER_M, 1);

function threadRule(summary: ProductionSummary, { t }: I18n): string {
  return t('production.threadRule', {
    factor: THREAD_STITCH_FACTOR,
    stitching: Math.round(summary.stitchingMm),
    round: THREAD_ROUND_MM / 10,
  });
}

function hardwareLines(summary: ProductionSummary, { t }: I18n): string[] {
  return summary.hardware.map((line) => {
    const words = {
      type: t(`hardware.${line.hardwareType}`),
      diameter: line.diameterMm,
      pieces: line.pieces,
    };
    return line.holes === line.pieces
      ? t('production.hardwareLine', words)
      : t('production.hardwareLineFolded', { ...words, count: line.holes });
  });
}

/** One of the summary's four figures: a number, the word under it, and what it means. */
export interface ProductionFigure {
  readonly id: 'pieces' | 'holes' | 'thread' | 'leather';
  readonly value: string;
  readonly caption: string;
  /** The tooltip: what the figure counts, or the rule of an estimate. */
  readonly tip: string;
}

/** A line of the cut list: a piece, how many, and whether half of them are turned over. */
export interface CutLine {
  readonly name: string;
  readonly quantity: string;
  /** "1 + 1 mirrored", or null for a piece cut only as drawn. */
  readonly mirrored: string | null;
}

/** What the Summary panel shows: the figures at a glance, then the list to cut by. */
export interface ProductionSheet {
  readonly figures: readonly ProductionFigure[];
  readonly cutList: readonly CutLine[];
  readonly hardware: readonly string[];
}

/**
 * The summary as the panel shows it: short words for a glance, the long ones
 * in tooltips. *Copy* keeps writing `productionRows`, every word spelled out.
 */
export function productionSheet(summary: ProductionSummary, i18n: I18n): ProductionSheet {
  const { t, locale } = i18n;
  // One decimal at most: a glance, not a quote. The tooltip and Copy keep the detail.
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    figures: [
      {
        id: 'pieces',
        value: number.format(summary.toCut),
        caption: t('production.figurePieces', { count: summary.toCut }),
        tip: t('production.pieces'),
      },
      {
        id: 'holes',
        value: number.format(summary.holes),
        caption: t('production.figureHoles', { count: summary.holes }),
        tip: t('production.holes'),
      },
      {
        id: 'thread',
        value: t('production.figureThread', { metres: number.format(metresOf(summary)) }),
        caption: t('production.figureThreadCaption'),
        tip: summary.threadMm === 0 ? t('production.noStitching') : threadRule(summary, i18n),
      },
      {
        id: 'leather',
        value: number.format(summary.leatherMm2 / MM2_PER_CM2 / CM2_PER_DM2),
        caption: t('production.figureLeatherUnit'),
        tip: t('production.leatherNote'),
      },
    ],
    cutList: summary.pieces.map((piece) => ({
      name: piece.name,
      quantity: t('production.quantity', { count: piece.quantity }),
      mirrored:
        piece.turnedOver > 0
          ? t('production.mirroredPair', {
              drawn: piece.quantity - piece.turnedOver,
              turned: piece.turnedOver,
            })
          : null,
    })),
    hardware: hardwareLines(summary, i18n),
  };
}

/**
 * The production summary's words (9.12): facts from the domain, worded here
 * (ADR 0018). A number is written as the language writes it, so a number is
 * passed, never formatted by hand.
 */
export function productionRows(summary: ProductionSummary, i18n: I18n): ProductionRow[] {
  const { t, locale } = i18n;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const cm2 = summary.leatherMm2 / MM2_PER_CM2;

  return [
    {
      id: 'pieces',
      label: t('production.pieces'),
      value: number.format(summary.toCut),
      details: summary.pieces.map((piece) => {
        if (piece.turnedOver > 0) {
          const pair = {
            name: piece.name,
            drawn: piece.quantity - piece.turnedOver,
            turned: piece.turnedOver,
          };
          return piece.holes === 0
            ? t('production.pieceLineMirroredNoHoles', pair)
            : t('production.pieceLineMirrored', { ...pair, count: piece.holes });
        }
        return piece.holes === 0
          ? t('production.pieceLineNoHoles', { name: piece.name, quantity: piece.quantity })
          : t('production.pieceLine', {
              name: piece.name,
              quantity: piece.quantity,
              count: piece.holes,
            });
      }),
    },
    { id: 'holes', label: t('production.holes'), value: number.format(summary.holes), details: [] },
    {
      id: 'hardware',
      label: t('production.hardware'),
      value: summary.hardware.length === 0 ? t('production.none') : '',
      details: hardwareLines(summary, i18n),
    },
    {
      id: 'thread',
      label: t('production.thread'),
      value:
        summary.threadMm === 0
          ? t('production.none')
          : t('production.threadValue', { metres: metresOf(summary) }),
      details: summary.threadMm === 0 ? [] : [threadRule(summary, i18n)],
    },
    {
      id: 'leather',
      label: t('production.leather'),
      value: t('production.leatherValue', {
        cm2: Math.round(cm2),
        dm2: roundTo(cm2 / CM2_PER_DM2, 2),
      }),
      details: [t('production.leatherNote')],
    },
  ];
}

/** The summary as plain text, for the clipboard: the rows as Properties shows them. */
export function productionText(name: string, rows: readonly ProductionRow[], { t }: I18n): string {
  return [
    t('production.textTitle', { name }),
    ...rows.flatMap((row) => [
      row.value === '' ? `${row.label}:` : `${row.label}: ${row.value}`,
      ...row.details.map((detail) => `  ${detail}`),
    ]),
  ].join('\n');
}
