import type { LucideIcon } from 'lucide-react';

/**
 * A Tier 1 icon (UI Foundations §10.2, ADR 0017): a generic verb from Lucide,
 * at §10.1's metrics — 16 px, an absolute 1.5 px stroke at any size, in the
 * current colour so a state changes its colour and never its shape.
 *
 * The one place Lucide is wrapped, so replacing it is a change here.
 */
export function Icon({ of: Of, size = 16 }: { of: LucideIcon; size?: number }) {
  return <Of className="icon" size={size} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />;
}
