import { cssVariables, type Density } from '@leathercad/render';

/**
 * Writes the design tokens onto `:root` (UI Foundations §2, F.4).
 *
 * The stylesheet holds no colour, radius or size of its own: it reads these,
 * which come from `packages/render/src/theme` — the module the canvas draws
 * with and the exporter prints from. Called before the first render, so no
 * frame is ever painted without them.
 *
 * Density is comfortable until a preference can choose otherwise (8.2).
 */
export function applyTheme(root: HTMLElement, density: Density = 'comfortable'): void {
  for (const [name, value] of Object.entries(cssVariables(density))) {
    root.style.setProperty(name, value);
  }
  root.dataset['density'] = density;
}
