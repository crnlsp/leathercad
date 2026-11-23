/**
 * What each part of row 3, the tool row (MS.5), adds to the row's width, in CSS
 * pixels, its spacing included: so the parts shown sum to the row they make.
 *
 * `head` is what the row always holds — the head cell, the gaps beside the
 * options and the row's own padding; `drawAs` is the "Draw as" before the
 * choices; `groupNames` Cut, Stitch and Mark; `choices` the boxed chips; and
 * `allKeys` the "? all keys" at the right. With no Draw as — a tool that draws
 * nothing, or the Sheets view — its three are 0.
 */
export type WorkRowWidths = {
  readonly head: number;
  readonly drawAs: number;
  readonly groupNames: number;
  readonly choices: number;
  readonly allKeys: number;
};

/** What row 3 shows: "? all keys", the group names, and the choices as chips or the select. */
export type WorkRowFit = {
  readonly allKeys: boolean;
  readonly groupNames: boolean;
  readonly choices: 'chips' | 'select';
};

/**
 * What row 3 keeps in the room it has (the spec's *Narrow windows*). It gives
 * way in a fixed order: "? all keys" first — the ? corner still lists every
 * key — then the group names, and only when the choices themselves do not fit
 * do they become the select the app already has.
 *
 * Each step is taken only when the steps before it were not enough, and a step
 * is never undone by the room it frees: once "? all keys" has gone it stays
 * gone, though the select is narrower than the chips. So, as the window
 * narrows, the row only ever loses things, always in this order, and a wider
 * window gives them back in reverse. A part is whole or absent, never cut.
 *
 * In the style of `fitHints`: widths measured as drawn, rounded out by the
 * caller; the edge itself is room enough.
 */
export function fitWorkRow(widths: WorkRowWidths, room: number): WorkRowFit {
  const chips = widths.head + widths.drawAs + widths.choices;
  const named = chips + widths.groupNames;
  return {
    allKeys: named + widths.allKeys <= room,
    groupNames: named <= room,
    choices: chips <= room ? 'chips' : 'select',
  };
}
