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
 * Severity, per plane (§5.4). Always a colour **plus a glyph** — filled
 * triangle, hollow triangle, dot — so colour is never the only carrier, and the
 * warning's move to orange (decisions §1.2) cannot be confused with error.
 */
export const STATE = {
  shell: { error: '#e5675f', warning: '#d9891f', info: '#6f9fd8' },
  ground: { error: '#c0392f', warning: '#b5651a', info: '#3c6fa8' },
} as const;
