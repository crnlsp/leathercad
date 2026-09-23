import type { LayerRole } from '@leathercad/domain';

import { ACCENT, GROUND, SHELL, STATE } from './palette.js';
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

  // The four planes (§5). Shell and state-on-shell are what the chrome reads;
  // the ground values are there for anything the chrome draws of the ground.
  for (const step of [900, 800, 700, 600] as const)
    variables[`--shell-${String(step)}`] = SHELL[step];
  variables['--shell-line'] = SHELL.line;
  variables['--text'] = SHELL.text;
  variables['--text-dim'] = SHELL.textDim;
  variables['--text-mute'] = SHELL.textMute;
  for (const [name, value] of Object.entries(GROUND)) {
    variables[name === 'ground' ? '--ground' : `--ground-${kebab(name)}`] = value;
  }
  variables['--ink'] = GROUND.ink;
  variables['--ink-dim'] = GROUND.inkDim;
  variables['--tan'] = ACCENT.tan;
  variables['--tan-ink'] = ACCENT.tanInk;
  variables['--on-tan'] = ACCENT.onTan;
  for (const [name, value] of Object.entries(STATE.shell)) variables[`--${name}`] = value;
  for (const [name, value] of Object.entries(STATE.ground)) variables[`--${name}-ground`] = value;
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
