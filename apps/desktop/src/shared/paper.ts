/**
 * Whether a printer offers the paper, as far as it says (7.6): CUPS names
 * sizes as the app does (`A4`, `Letter`), sometimes with a variant after a dot
 * (`A4.Borderless`). A printer that does not say — `papers` is null — is given
 * the benefit of the doubt; CUPS still refuses a size the printer lacks.
 *
 * Shared, so the Print Preview and the main process, which checks every job
 * again before `lp` runs, give one answer.
 */
export function offersPaper(papers: readonly string[] | null, paper: string): boolean {
  if (papers === null) return true;
  return papers.some((name) => name.split('.')[0]!.toLowerCase() === paper.toLowerCase());
}
