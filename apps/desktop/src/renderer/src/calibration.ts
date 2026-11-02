/**
 * A printer's correction factor as the change it makes, in the maker's
 * language (7.5): 1.0026 is `+0.26%`, 0.995 is `-0.50%`. A percentage, to the
 * hundredth: what a maker compares with a rule's reading, and what tells a
 * correction of a printer's few tenths from a *Fit to page*'s three.
 */
export function describeFactor(factor: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(factor - 1);
}
