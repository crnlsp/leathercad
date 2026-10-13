/**
 * How the frame gives the board its room (R-04, the requirements' §5, U.5).
 *
 * The rail, Parts and Properties each take a column, a 40 px strip, or
 * nothing, by how wide the window is, what the maker chose, and focus mode.
 * The widths themselves are the theme's (`PANEL_PX`, `RAIL_PX`); this decides
 * only which of them each one takes. **Nothing may become unreachable**: a
 * panel that is not docked opens over the board, from its strip or its chip in
 * the status bar.
 */

/** The two panels that fold: Parts on the left, Properties on the right. */
export type Panel = 'parts' | 'properties';

export const PANELS: readonly Panel[] = ['parts', 'properties'];

/**
 * How much room the window has, in §5's order of giving it up: below 1280
 * px the rail drops its names and Properties folds to a strip; below 900 Parts
 * leaves its column too, and both open over the board.
 */
export type Room = 'wide' | 'narrow' | 'cramped';

/** Where each step of §5 begins, in CSS pixels of window width. */
export const ROOM_PX = { wide: 1280, narrow: 900 } as const;

export function roomAt(width: number): Room {
  return width >= ROOM_PX.wide ? 'wide' : width >= ROOM_PX.narrow ? 'narrow' : 'cramped';
}

/** What the maker chose: remembered, but for opening the rail on a narrow window. */
export interface PanelChoices {
  readonly railCollapsed: boolean;
  /** For the session: it answers the window being small, not a liking. */
  readonly railExpandedWhileNarrow: boolean;
  readonly partsFolded: boolean;
  readonly propertiesFolded: boolean;
}

/** A panel as a column of its own, as a strip of icons, or as neither: only its chip. */
export type PanelShape = 'docked' | 'strip' | 'hidden';

export interface PanelLayout {
  /** The rail's tools with their names (152 px), or keys only (56 px). */
  readonly railNames: boolean;
  readonly parts: PanelShape;
  readonly properties: PanelShape;
}

/** Whether a panel may take a column here: Properties from 1280 px, Parts from 900. */
function canDock(panel: Panel, room: Room): boolean {
  return room === 'wide' || (room === 'narrow' && panel === 'parts');
}

export function layoutFor(room: Room, choices: PanelChoices, focus: boolean): PanelLayout {
  const shape = (panel: Panel, folded: boolean): PanelShape => {
    if (focus || room === 'cramped') return 'hidden';
    return canDock(panel, room) && !folded ? 'docked' : 'strip';
  };
  return {
    railNames:
      !focus && (room === 'wide' ? !choices.railCollapsed : choices.railExpandedWhileNarrow),
    parts: shape('parts', choices.partsFolded),
    properties: shape('properties', choices.propertiesFolded),
  };
}

/**
 * What a panel's toggle does here — its key (`[` or `]`), its header's
 * button, its strip's, its chip: where it can take a column, fold or unfold
 * it, which is the maker's choice and remembered; where it cannot, or in focus
 * mode, open it over the board for now. So a narrow window's folding never
 * overwrites a choice made on a wide one.
 */
export function toggleOf(panel: Panel, room: Room, focus: boolean): 'fold' | 'overlay' {
  return !focus && canDock(panel, room) ? 'fold' : 'overlay';
}
