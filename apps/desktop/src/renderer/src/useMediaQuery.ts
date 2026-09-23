import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches, kept current as the window changes.
 *
 * The layout's breakpoints live in CSS; this is for the few decisions that are
 * state rather than style — whether the rail starts collapsed, and whether a
 * panel is an overlay that needs a toggle (UI Foundations §7.2).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
