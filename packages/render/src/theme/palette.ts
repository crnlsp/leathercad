/**
 * The four colour planes (UI Foundations §5, F.5). They never borrow from each
 * other: a shell colour is never drawn on the ground, and a role colour never
 * paints chrome.
 */

/** The application around the drawing: warm-biased greys under a tan accent. */
export const SHELL = {
  900: '#14161a',
  800: '#1b1d21',
  700: '#22252a',
  600: '#2a2e34',
  line: '#32363d',
  text: '#e6e8ea',
  textDim: '#8b929b',
  textMute: '#6b7079',
  /**
   * A scrollbar's thumb, on a track of whatever it scrolls (U.20): 3 : 1 on
   * every surface that scrolls, so it is found without hunting. The value of
   * `textMute`, which is kept for disabled words and placeholders.
   */
  scrollbar: '#6b7079',
} as const;

/**
 * The drafting ground: the whole canvas, a warm-neutral off-white. No texture,
 * no gradient, no page rectangle — the model's space is unbounded, and a page
 * edge would imply a page the document does not have (§5.2).
 */
export const GROUND = {
  ground: '#f1eee8',
  fine: '#e2ddd3',
  major: '#d2cbbd',
  hundred: '#beb5a3',
  axis: '#a89e88',
  ink: '#1d2126',
  inkDim: '#6e695e',
  /**
   * The board's secondary words (R-01): a caption's detail under the piece's
   * name. 6.0 : 1 on the ground, where `inkDim` was 4.7.
   */
  label: '#5e5950',
  /**
   * Inside a piece on screen (R-02): flat and a shade paler than the ground,
   * with no grid, so a piece reads as a cut piece on a cutting mat. Never
   * printed.
   */
  pieceFill: '#faf8f4',
  /** The piece being worked on: any of its features selected. */
  pieceFillSelected: '#f7f1de',
} as const;

/**
 * The accent means one thing — the user's own current focus — and needs a value
 * for each plane (§5.3).
 */
export const ACCENT = {
  /** On the shell: active tool, focus ring, primary fill. */
  tan: '#c9a227',
  /** On the ground: selection halo, anchors, active guides. */
  tanInk: '#a8810e',
  onTan: '#1d2126',
} as const;

/**
 * The window's actions on the shell (R-06, U.7). **Print** is the one primary
 * action, in the paper's colour: it is what goes on paper. Green left the
 * actions in 1.5 — on the board green is the fold's colour (7.6 had Print
 * green). Export PDF is a secondary action on `SHELL[600]`. Each is a split
 * button whose narrow half is a shade apart: Print's problems indicator on
 * `primarySide`, Export's menu on `secondarySide`.
 */
export const ACTION = {
  primary: GROUND.ground,
  /** Print's main half under the pointer: lighter still. */
  primaryHover: GROUND.pieceFill,
  primarySide: GROUND.major,
  secondarySide: '#3a3f47',
  /** Words and glyphs on `primary`, `primarySide`, and the shell's warning and error. */
  onPrimary: SHELL[900],
} as const;

/**
 * Severity, per plane (§5.4). Always a colour **plus a glyph** — filled
 * triangle, hollow triangle, dot — so colour is never the only carrier, and the
 * warning's move to orange (decisions §1.2) cannot be confused with error.
 */
export const STATE = {
  shell: { error: '#e5675f', warning: '#d9891f', info: '#6f9fd8' },
  ground: { error: '#c0392f', warning: '#b5651a', info: '#3c6fa8' },
} as const;

/**
 * The shell's one word for *all is well* (8.9): the version is the latest. A
 * sage, quiet beside the tan, and only ever beside a tick — never alone, and
 * never a severity. Shell only: on the ground green is the fold's.
 */
export const CONFIRM = { ok: '#7dae8b' } as const;
