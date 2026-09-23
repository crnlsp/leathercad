/**
 * The non-colour tokens (UI Foundations §4.2, §6.1–6.3).
 *
 * Plain values; `css.ts` writes them as custom properties. Kept here, beside
 * the palette and the role table, so the stylesheet never holds a number of
 * its own.
 */

const FONT = "'IBM Plex Sans', sans-serif";

/** The type scale from F.0: nine tokens, three weights, one face. */
export const TYPE = {
  dialog: `600 19px/26px ${FONT}`,
  panel: `600 16px/22px ${FONT}`,
  strong: `600 14px/20px ${FONT}`,
  body: `400 14px/20px ${FONT}`,
  label: `500 12px/16px ${FONT}`,
  micro: `500 11px/15px ${FONT}`,
  'num-lg': `500 17px/22px ${FONT}`,
  num: `500 14px/20px ${FONT}`,
  'num-micro': `500 11px/14px ${FONT}`,
} as const;

export const FONT_SANS = FONT;

export const TRACKING = { title: '-0.01em', micro: '0.02em' } as const;

/** A 4 px rhythm: --space-1 … --space-6. */
export const SPACE_PX = [4, 8, 12, 16, 24, 32] as const;

/** Three radii, replacing five ad-hoc values. */
export const RADIUS = { sm: '3px', md: '5px', pill: '999px' } as const;

/**
 * Two elevation steps, and only the raised one casts a shadow: dialogs and
 * popovers. CAD chrome should be crisp.
 */
export const ELEVATION = {
  raised: '0 8px 24px rgb(0 0 0 / 45%)',
  scrim: 'rgb(10 11 13 / 55%)',
} as const;

/**
 * Colour-only transitions — no transforms, no bounce. A precision tool that
 * bounces is one you stop trusting; one that never acknowledges a press feels
 * broken. `prefers-reduced-motion` turns it off in the stylesheet.
 */
export const MOTION = '120ms ease-out';

export type Density = 'comfortable' | 'compact';

/**
 * What density changes: row and control heights, never the type (decisions
 * §1.1). Compact returns rows to roughly their height before 14 px type.
 * No switch for it yet — theming and density are post-1.0 — but the token
 * exists from day one, so choosing it later re-derives nothing.
 */
export const DENSITY: Readonly<
  Record<Density, { control: number; controlLg: number; rowPadY: number }>
> = {
  comfortable: { control: 28, controlLg: 32, rowPadY: 4 },
  compact: { control: 24, controlLg: 28, rowPadY: 2 },
};

export const RAIL_PX = { expanded: 152, collapsed: 52 } as const;
