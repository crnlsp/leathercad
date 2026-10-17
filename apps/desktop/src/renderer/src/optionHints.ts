import type { MessageKey } from '../../shared/i18n.js';
import { keysOf, type Binding, type CommandId } from './keymap.js';
import type { ToolId } from './tools.js';

/**
 * The work bar's hints (U.11, R-11): a key as a cap and a few words, per tool
 * and per state, so the keys are learned while they are wanted — in place of
 * one long sentence that was cut off at most widths.
 *
 * A hint names its key by the keymap's command, never by a letter, so a hint
 * follows the layout and the platform (U.3) and, once keys can be changed
 * (U.12), follows that. The words are the catalogue's (`hints.*`, ADR 0018),
 * written to follow the cap: *Esc* + "cancels".
 */
export interface Hint {
  /** The cap before the words; absent for a pointer gesture, which has none. */
  readonly key?: CommandId | Binding;
  readonly words: MessageKey;
  /**
   * 1 is the last to go as the row narrows, 2 the next, and so on, each once in
   * a set. 0 is "all keys", which never goes.
   */
  readonly rank: number;
}

/** What a tool's hints depend on. */
export interface HintSituation {
  readonly tool: ToolId;
  /** Anything is selected, a piece picked by its heading included. */
  readonly selected: boolean;
  /** The selection is an outline whose sizes open on the board (U.14). */
  readonly sizable: boolean;
  /** A shape is between its clicks (`Tool.underway`). */
  readonly underway: boolean;
}

/** Shift, held: a modifier on its own, which no command binds. */
const SHIFT: Binding = { code: 'Shift' };

/** `?`: the character that opens the list of every key, whatever the layout types it with. */
const QUESTION: Binding = keysOf('keyboardShortcuts').find((binding) => 'char' in binding)!;

/** The one hint that never drops: the way to every other key. */
export const ALL_KEYS: Hint = { key: QUESTION, words: 'hints.allKeys', rank: 0 };

const gesture = (words: MessageKey, rank: number): Hint => ({ words, rank });
const press = (key: CommandId | Binding, words: MessageKey, rank: number): Hint => ({
  key,
  words,
  rank,
});

const BACK_TO_SELECT = (rank: number): Hint => press('tool.select', 'hints.backToSelect', rank);
const CANCELS = (rank: number): Hint => press('cancel', 'hints.cancels', rank);

/** Select: what a click, a key and a drag do, with nothing picked and with something. */
const SELECT = {
  none: [
    gesture('hints.clickSelects', 1),
    press(SHIFT, 'hints.addsOrRemoves', 3),
    gesture('hints.dragBox', 2),
  ],
  some: [
    gesture('hints.dragMoves', 2),
    press(SHIFT, 'hints.addsOrRemoves', 4),
    press('delete', 'hints.deletes', 1),
    CANCELS(3),
  ],
  // Enter opens the outline's sizes beside it (U.14): the key worth learning.
  outline: [
    press('editSizes', 'hints.editsSizes', 1),
    gesture('hints.dragMoves', 3),
    press(SHIFT, 'hints.addsOrRemoves', 4),
    press('delete', 'hints.deletes', 2),
  ],
} satisfies Record<string, readonly Hint[]>;

interface ToolHints {
  readonly idle: readonly Hint[];
  /** Between clicks; for a tool with no such state, as `idle`. */
  readonly underway?: readonly Hint[];
  /** With nothing selected, for a tool that works on a selection. */
  readonly nothingSelected?: readonly Hint[];
}

const BY_TOOL: Readonly<Record<Exclude<ToolId, 'select'>, ToolHints>> = {
  rectangle: {
    idle: [
      gesture('hints.rectangleDrag', 1),
      press(SHIFT, 'hints.keepSquare', 2),
      gesture('hints.typeSize', 3),
      BACK_TO_SELECT(4),
    ],
    underway: [
      gesture('hints.rectangleCorner', 1),
      CANCELS(2),
      gesture('hints.typeSize', 3),
      press(SHIFT, 'hints.keepSquare', 4),
    ],
  },
  circle: {
    idle: [gesture('hints.circleDrag', 1), BACK_TO_SELECT(2)],
    underway: [gesture('hints.circleRim', 1), CANCELS(2)],
  },
  arc: {
    idle: [gesture('hints.arcStart', 1), BACK_TO_SELECT(2)],
    underway: [gesture('hints.arcNext', 1), press('takeBack', 'hints.takesBack', 3), CANCELS(2)],
  },
  line: {
    idle: [gesture('hints.lineDrag', 1), press(SHIFT, 'hints.holdsSteps', 2), BACK_TO_SELECT(3)],
    underway: [gesture('hints.lineEnd', 1), CANCELS(2), press(SHIFT, 'hints.holdsSteps', 3)],
  },
  polyline: {
    idle: [gesture('hints.polylinePoints', 1), BACK_TO_SELECT(2)],
    underway: [
      press('finishPolyline', 'hints.finishes', 1),
      // The key only a polyline has, and the one a maker is least likely to guess.
      press('arcOrStraight', 'hints.arcsNext', 2),
      press('takeBack', 'hints.takesBack', 3),
      gesture('hints.polylineClose', 4),
    ],
  },
  measure: {
    idle: [gesture('hints.measureFirst', 1), BACK_TO_SELECT(2)],
    underway: [gesture('hints.measureSecond', 1), CANCELS(2)],
  },
  hardware: {
    idle: [gesture('hints.hardwarePunch', 1), BACK_TO_SELECT(2)],
    nothingSelected: [
      press('tool.select', 'hints.hardwarePick', 1),
      gesture('hints.hardwarePunch', 2),
    ],
  },
  text: {
    idle: [gesture('hints.textPlace', 1), gesture('hints.textType', 2), BACK_TO_SELECT(3)],
    nothingSelected: [
      press('tool.select', 'hints.textPick', 1),
      gesture('hints.textPlace', 2),
      gesture('hints.textType', 3),
    ],
  },
  points: {
    idle: [
      gesture('hints.pointsMove', 1),
      gesture('hints.pointsAdd', 2),
      press('removePoint', 'hints.pointsRemove', 3),
      press('roundCorner', 'hints.pointsRound', 4),
    ],
    nothingSelected: [
      press('tool.select', 'hints.pointsPick', 1),
      gesture('hints.pointsMove', 2),
      gesture('hints.pointsAdd', 3),
    ],
  },
  rotate: {
    idle: [gesture('hints.rotateDrag', 1), press(SHIFT, 'hints.holdsSteps', 2), BACK_TO_SELECT(3)],
    nothingSelected: [press('tool.select', 'hints.rotatePick', 1), gesture('hints.rotateDrag', 2)],
  },
  scale: {
    idle: [
      gesture('hints.scaleDrag', 1),
      press(SHIFT, 'hints.holdsProportions', 2),
      BACK_TO_SELECT(3),
    ],
    nothingSelected: [press('tool.select', 'hints.scalePick', 1), gesture('hints.scaleDrag', 2)],
  },
};

/** The hints for a tool in a state, in the order they are shown, "all keys" last. */
export function hintsFor(situation: HintSituation): readonly Hint[] {
  return [...contentFor(situation), ALL_KEYS];
}

function contentFor({ tool, selected, sizable, underway }: HintSituation): readonly Hint[] {
  if (tool === 'select') return !selected ? SELECT.none : sizable ? SELECT.outline : SELECT.some;
  const hints = BY_TOOL[tool];
  if (underway && hints.underway !== undefined) return hints.underway;
  if (!selected && hints.nothingSelected !== undefined) return hints.nothingSelected;
  return hints.idle;
}

/** The Sheets view: what a click does on paper, and the keys that are about paper. */
export const SHEETS_HINTS: readonly Hint[] = [
  gesture('hints.sheetsClick', 1),
  press('print', 'hints.sheetsPrint', 2),
  press('exportPdf', 'hints.sheetsExport', 3),
  ALL_KEYS,
];

/**
 * Which hints fit, as one answer for each, in the order they were given.
 *
 * The lowest-ranked drops first, and nothing is dropped out of turn: a hint is
 * never kept because it is narrower than the one above it that did not fit,
 * so what the maker sees at a width is always the top of the ranking and a
 * hint reappears only for the room it ranks. A rank of 0 is never dropped, even
 * when there is no room for it — a whole hint overflowing is better than the way
 * to every key gone. A hint is whole or absent: its width is measured, never cut.
 *
 * @param sizes each hint's width in CSS pixels, and its rank
 * @param room the width the hints may take
 * @param gap the space between two neighbours
 */
export function fitHints(
  sizes: readonly { readonly width: number; readonly rank: number }[],
  room: number,
  gap: number,
): readonly boolean[] {
  const kept = sizes.map((hint) => hint.rank === 0);
  // The pinned hints are paid for first; then the rest, best-ranked first.
  let used = 0;
  let count = 0;
  const take = (index: number): void => {
    used += sizes[index]!.width + (count === 0 ? 0 : gap);
    count += 1;
  };
  sizes.forEach((_, index) => {
    if (kept[index]) take(index);
  });
  const byRank = sizes
    .map((_, index) => index)
    .filter((index) => !kept[index])
    .sort((a, b) => sizes[a]!.rank - sizes[b]!.rank);
  for (const index of byRank) {
    if (used + (count === 0 ? 0 : gap) + sizes[index]!.width > room) break;
    kept[index] = true;
    take(index);
  }
  return kept;
}
