import type { SheetPlan } from '@leathercad/export';

/**
 * The sheets left out of a print once sheet `number` is ticked in or out
 * (7.2). A part's assembly map belongs to it: it is left out with the last of
 * the part's tiles, and back with the first of them, and no other part's map
 * moves. The map can still be left out, or put back, on its own.
 */
export function leaveOut(
  plan: SheetPlan,
  omitted: ReadonlySet<number>,
  number: number,
  include: boolean,
): ReadonlySet<number> {
  const next = new Set(omitted);
  if (include) next.delete(number);
  else next.add(number);

  for (const sheet of plan.sheets) {
    const tiles = sheet.assembly?.tiles.map((entry) => entry.sheet) ?? [];
    if (!tiles.includes(number)) continue;
    const map = sheet.index + 1;
    const wasOut = tiles.every((n) => omitted.has(n));
    const isOut = tiles.every((n) => next.has(n));
    if (isOut && !wasOut) next.add(map);
    if (wasOut && !isOut) next.delete(map);
  }
  return next;
}
