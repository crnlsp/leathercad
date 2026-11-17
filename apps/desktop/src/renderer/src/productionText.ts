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

/**
 * The production summary's words (9.12): facts from the domain, worded here
 * (ADR 0018). A number is written as the language writes it, so a number is
 * passed, never formatted by hand.
 */
export function productionRows(summary: ProductionSummary, { t, locale }: I18n): ProductionRow[] {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const roundTo = (value: number, places: number) => Number(value.toFixed(places));
  const cm2 = summary.leatherMm2 / MM2_PER_CM2;

  return [
    {
      id: 'pieces',
      label: t('production.pieces'),
      value: number.format(summary.toCut),
      details: summary.pieces.map((piece) =>
        piece.holes === 0
          ? t('production.pieceLineNoHoles', { name: piece.name, quantity: piece.quantity })
          : t('production.pieceLine', {
              name: piece.name,
              quantity: piece.quantity,
              count: piece.holes,
            }),
      ),
    },
    { id: 'holes', label: t('production.holes'), value: number.format(summary.holes), details: [] },
    {
      id: 'hardware',
      label: t('production.hardware'),
      value: summary.hardware.length === 0 ? t('production.none') : '',
      details: summary.hardware.map((line) => {
        const words = {
          type: t(`hardware.${line.hardwareType}`),
          diameter: line.diameterMm,
          pieces: line.pieces,
        };
        return line.holes === line.pieces
          ? t('production.hardwareLine', words)
          : t('production.hardwareLineFolded', { ...words, count: line.holes });
      }),
    },
    {
      id: 'thread',
      label: t('production.thread'),
      value:
        summary.threadMm === 0
          ? t('production.none')
          : t('production.threadValue', { metres: roundTo(summary.threadMm / 1000, 1) }),
      details:
        summary.threadMm === 0
          ? []
          : [
              t('production.threadRule', {
                factor: THREAD_STITCH_FACTOR,
                stitching: Math.round(summary.stitchingMm),
                round: THREAD_ROUND_MM / 10,
              }),
            ],
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
