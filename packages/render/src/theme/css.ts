import type { LayerRole } from '@leathercad/domain';

import { PALETTE } from './palette.js';
import { ROLE_STYLES } from './roles.js';
import {
  DENSITY,
  ELEVATION,
  FONT_SANS,
  MOTION,
  RADIUS,
  RAIL_PX,
  SPACE_PX,
  TRACKING,
  TYPE,
  type Density,
} from './tokens.js';

/** camelCase to kebab-case, for a custom property name. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Every token as a CSS custom property, ready for `:root`.
 *
 * `apps/desktop` writes these at startup, so the stylesheet consumes the same
 * numbers the canvas draws with rather than a hand-kept copy (UI Foundations
 * §2, "Where the tokens live"). An audit test holds every `var(--…)` in the
 * stylesheet to this list.
 */
export function cssVariables(density: Density): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const [name, value] of Object.entries(PALETTE)) variables[`--${kebab(name)}`] = value;
  for (const [role, style] of Object.entries(ROLE_STYLES) as [LayerRole, { colour: string }][]) {
    variables[`--role-${role}`] = style.colour;
  }

  variables['--font-sans'] = FONT_SANS;
  for (const [name, value] of Object.entries(TYPE)) variables[`--t-${name}`] = value;
  variables['--tracking-title'] = TRACKING.title;
  variables['--tracking-micro'] = TRACKING.micro;

  SPACE_PX.forEach((px, index) => {
    variables[`--space-${String(index + 1)}`] = `${String(px)}px`;
  });
  for (const [name, value] of Object.entries(RADIUS)) variables[`--r-${name}`] = value;
  variables['--elevation-raised'] = ELEVATION.raised;
  variables['--scrim'] = ELEVATION.scrim;
  variables['--motion'] = MOTION;

  const rows = DENSITY[density];
  variables['--h-control'] = `${String(rows.control)}px`;
  variables['--h-control-lg'] = `${String(rows.controlLg)}px`;
  variables['--row-pad-y'] = `${String(rows.rowPadY)}px`;
  variables['--rail-w-expanded'] = `${String(RAIL_PX.expanded)}px`;
  variables['--rail-w-collapsed'] = `${String(RAIL_PX.collapsed)}px`;

  return variables;
}
