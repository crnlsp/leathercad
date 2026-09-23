/**
 * The interface's colours, as they are today. F.5 replans them into the four
 * colour planes; until then this is the one place they are written down, so
 * the canvas, the panels and the stylesheet cannot drift apart.
 */
export const PALETTE = {
  bg: '#1b1d21',
  bgRaised: '#22252a',
  /** Inputs and badges: a step below the panel they sit in. */
  inset: '#14161a',
  hover: '#262a30',
  active: '#2c313a',
  popover: '#16181c',
  tooltip: '#101215',
  border: '#32363d',
  borderHover: '#444b55',
  text: '#e6e8ea',
  textDim: '#8b929b',
  tick: '#5a626d',
  /** Veg-tan. */
  accent: '#c9a227',
  error: '#e5675f',
  warning: '#e0a93a',
  info: '#6f9fd8',
} as const;
