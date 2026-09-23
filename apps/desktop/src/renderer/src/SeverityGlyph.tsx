import type { Severity } from '@leathercad/domain';

/**
 * The shape that goes with a severity's colour (UI Foundations §5.4, F.5):
 * error a filled triangle, warning a hollow one, info a dot — the same three
 * the canvas marker draws.
 *
 * Colour is never the only carrier. It is what keeps the orange warning apart
 * from the red error in greyscale and for colour-blind readers, and what made
 * moving warning out of the accent's gold safe. Drawn as SVG rather than a
 * Unicode triangle, which the vendored face does not have: a fallback font
 * would be a system font.
 */
export function SeverityGlyph({ severity }: { severity: Severity }) {
  return (
    <svg
      className={`severity-glyph severity-${severity}`}
      data-glyph={severity}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      role="img"
      aria-label={severity}
    >
      {severity === 'info' ? (
        <circle cx="5" cy="5" r="3" fill="currentColor" />
      ) : (
        <polygon
          points="5,1 9.2,8.8 0.8,8.8"
          fill={severity === 'error' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
