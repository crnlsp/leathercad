import { NOMINAL_IRON } from '@leathercad/render';
import type { ReactElement } from 'react';

import type { IconName } from './names.js';

const fmt = (value: number): string => String(Math.round(value * 100) / 100);

/** A slit at the iron's slant, `half` either side of its centre: the set's stitch mark. */
function slit(cx: number, cy: number, half: number): string {
  // SVG Y points down, so a slit leaning right rises to the right.
  const dx = half * Math.cos(NOMINAL_IRON.slantRad);
  const dy = half * Math.sin(NOMINAL_IRON.slantRad);
  return `M${fmt(cx - dx)} ${fmt(cy + dy)}L${fmt(cx + dx)} ${fmt(cy - dy)}`;
}

/** A point at `radius` and `angle` from the box's centre. */
const at = (radius: number, angle: number): string =>
  `${fmt(8 + radius * Math.cos(angle))} ${fmt(8 + radius * Math.sin(angle))}`;

/** Eight teeth, each a flat top between two flanks, round a ring. */
function gearOutline(): string {
  const deg = (d: number): number => (d * Math.PI) / 180;
  const points: string[] = [];
  for (let tooth = 0; tooth < 8; tooth++) {
    const centre = deg(tooth * 45 - 22.5);
    points.push(
      at(4.7, centre - deg(15)),
      at(6.3, centre - deg(8)),
      at(6.3, centre + deg(8)),
      at(4.7, centre + deg(15)),
    );
  }
  return `M${points.join('L')}Z`;
}

/** Eight slits round a ring, fading behind the leader, so the turn has a direction. */
const SLIT_RING = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4 - Math.PI / 2;
  return (
    <path
      key={i}
      d={slit(8 + 5 * Math.cos(angle), 8 + 5 * Math.sin(angle), 1.56)}
      strokeWidth="1.4"
      strokeLinecap="butt"
      opacity={fmt(1 - i * 0.11)}
    />
  );
});

const strike = <path d="M2.5 13.5 13.5 2.5" />;
const dot = (cx: number, cy: number, r: number) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);
const diamond = (cx: number, cy: number, half: number) => (
  <path
    d={`M${fmt(cx)} ${fmt(cy - half)}l${half} ${half}-${half} ${half}-${half}-${half}z`}
    fill="currentColor"
    stroke="none"
  />
);
/** An axis in the fold's dash-dot rhythm, for Flip and Mirror. */
const axis = (
  <path d="M8 1.5v13" strokeWidth="1" strokeDasharray="2.5 1 .75 1" strokeLinecap="butt" />
);
/** A pattern card, clipped at the corner like the piece mark. */
const card = (
  <>
    <path d="M3 1.75h6.25L13 5.5v8.75H3z" />
    <path d="M9.25 1.75V5.5H13" strokeWidth="1.25" />
  </>
);
const sheet = <rect x="3.5" y="1.75" width="9" height="12.5" rx="1" />;
const corners = (
  <path d="M2.25 5.75v-2a1.5 1.5 0 0 1 1.5-1.5h2M10.25 2.25h2a1.5 1.5 0 0 1 1.5 1.5v2M13.75 10.25v2a1.5 1.5 0 0 1-1.5 1.5h-2M5.75 13.75h-2a1.5 1.5 0 0 1-1.5-1.5v-2" />
);
const eye = (
  <>
    <path d="M1.5 8c1.6-3.1 3.9-4.6 6.5-4.6s4.9 1.5 6.5 4.6c-1.6 3.1-3.9 4.6-6.5 4.6S3.1 11.1 1.5 8z" />
    <circle cx="8" cy="8" r="2.1" />
    {dot(8, 8, 0.75)}
  </>
);
const padlock = (
  <>
    <rect x="2.75" y="7" width="10.5" height="7.25" rx="1.5" />
    {dot(8, 10.6, 1.1)}
  </>
);
const pushPin = (
  <>
    <path d="M5.5 2h5" />
    <path d="M6.5 2v4.25L4.25 9h7.5L9.5 6.25V2" />
    <path d="M8 9v5" />
  </>
);
const flipped = (
  <>
    {axis}
    <path d="M6.25 3.5v9H1.75z" fill="currentColor" />
    <path d="M9.75 3.5v9h4.5z" strokeWidth="1.25" />
  </>
);
const mirrored = (
  <>
    {axis}
    <path d="M6.25 3.5v9H1.75z" />
    <path d="M9.75 3.5v9h4.5z" />
  </>
);

/**
 * LeatherCAD's icons (ADR 0021), each the inside of a 16-unit box drawn with
 * a 1.5 stroke in the current colour. The outline is the one people already
 * know for the job; the LeatherCAD detail — a rivet, a slit at the iron's
 * slant, a stitched seam, a pattern card's clipped corner — sits inside it.
 * The audit behind each drawing is docs/superpowers/specs/2026-10-25-icon-set.md.
 */
const GLYPHS = {
  // The window's big switches.
  'view-design': (
    <>
      <path d="M12 1.5l2.5 2.5-7.25 7.25-3 .5.5-3z" />
      <path d="M10.5 3l2.5 2.5" strokeWidth="1.25" />
      <path d="M1.75 14c1.3-.9 2.6-.9 3.9 0s2.6.9 3.9 0" strokeWidth="1.25" />
      {/* The line ends in a construction node, as the drawing tools' icons do. */}
      <rect x="11" y="12.75" width="2.5" height="2.5" fill="currentColor" stroke="none" />
    </>
  ),
  'view-sheets': (
    <>
      <path d="M5.5 4.25V2.75a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-1.25" />
      <rect x="2.5" y="4.25" width="8.75" height="10" rx="1" />
      {/* The registration cross the app prints to line sheets up. */}
      <circle cx="6.875" cy="9.25" r="1.6" strokeWidth="1" />
      <path d="M6.875 6.75v5M4.375 9.25h5" strokeWidth="1" />
    </>
  ),
  settings: (
    <>
      <path d={gearOutline()} />
      {/* A rivet for its hub. */}
      <circle cx="8" cy="8" r="2" strokeWidth="1.25" />
      {dot(8, 8, 0.7)}
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.1 6.3a2 2 0 1 1 2.65 1.9c-.45.18-.75.55-.75 1.05v.45" strokeWidth="1.4" />
      {diamond(8, 11.75, 0.8)}
    </>
  ),

  // Workshop tools.
  text: (
    <>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
      <path d="M5.25 5.5h5.5M8 5.5v5.25" />
    </>
  ),
  ruler: (
    <>
      <path d="M1.75 10.5 10.5 1.75l3.75 3.75-8.75 8.75z" />
      <path d="M3.5 8.75l1.25 1.25M5.25 7l1.75 1.75M7 5.25l1.25 1.25" strokeWidth="1" />
      {/* The hanging hole a steel rule has. */}
      <circle cx="11.5" cy="4.5" r=".8" strokeWidth="1" />
    </>
  ),
  spinner: <>{SLIT_RING}</>,
  clock: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M8 6v2.1l1.4.9" strokeWidth="1.25" />
      <path d="M5.9 4.6 6.3 1.75h3.4l.4 2.85M5.9 11.4l.4 2.85h3.4l.4-2.85" />
    </>
  ),
  squeezed: (
    <>
      <path
        d={slit(5.25, 5.25, 2.12) + slit(8, 5.25, 2.12) + slit(10.75, 5.25, 2.12)}
        strokeWidth="1.2"
        strokeLinecap="butt"
      />
      <path
        d="M2 11.5h3.75M10.25 11.5H14M4.25 9.75 6 11.5l-1.75 1.75M11.75 9.75 10 11.5l1.75 1.75"
        strokeWidth="1.25"
      />
    </>
  ),
  stretched: (
    <>
      <path
        d={slit(3.25, 5.25, 2.12) + slit(8, 5.25, 2.12) + slit(12.75, 5.25, 2.12)}
        strokeWidth="1.2"
        strokeLinecap="butt"
      />
      <path
        d="M2 11.5h4.5M9.5 11.5H14M3.75 9.75 2 11.5l1.75 1.75M12.25 9.75 14 11.5l-1.75 1.75"
        strokeWidth="1.25"
      />
    </>
  ),

  // Paper and pieces.
  paper: (
    <>
      <rect x="3.25" y="1.75" width="9.5" height="12.5" rx=".75" />
      <path d="M5.25 4.75h5.5M5.25 7h3.5" strokeWidth="1" />
      {/* The 100 mm gauge every sheet carries. */}
      <path
        d="M5.25 11.5h5.5M5.25 10.25v1.25M7.08 10.75v.75M8.92 10.75v.75M10.75 10.25v1.25"
        strokeWidth="1"
      />
    </>
  ),
  'not-printed': (
    <>
      <path d="M4.75 5.25V2.25h6.5v3" />
      <path d="M4.75 11.25h-1.5A1.25 1.25 0 0 1 2 10V6.5a1.25 1.25 0 0 1 1.25-1.25h9.5A1.25 1.25 0 0 1 14 6.5V10a1.25 1.25 0 0 1-1.25 1.25h-1.5" />
      <path d="M4.75 9h6.5v4.75h-6.5z" />
      {strike}
    </>
  ),
  duplicate: (
    <>
      <path d="M5.5 5V2.75a.5.5 0 0 1 .5-.5h5l2.75 2.75v6.75a.5.5 0 0 1-.5.5H11" />
      <path d="M2.25 5.5h5.5l2.75 2.75v5.5a.5.5 0 0 1-.5.5H2.75a.5.5 0 0 1-.5-.5z" />
      <path d="M7.75 5.5v2.75h2.75" strokeWidth="1.25" />
    </>
  ),
  // A flip moves the piece: solid where it is, open where it goes.
  'flip-lr': flipped,
  'flip-ud': <g transform="rotate(90 8 8)">{flipped}</g>,
  // A mirror adds a counterpart: both drawn.
  'mirror-lr': mirrored,
  'mirror-ud': <g transform="rotate(90 8 8)">{mirrored}</g>,

  // Seeing and holding.
  visible: eye,
  hidden: (
    <>
      {eye}
      {strike}
    </>
  ),
  locked: (
    <>
      {padlock}
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  unlocked: (
    <>
      {padlock}
      <path d="M5 7V5a3 3 0 0 1 5.8-1.1" />
    </>
  ),
  focus: corners,
  fit: (
    <>
      {corners}
      <path d="M5.5 5h3.25l1.75 1.75V11h-5z" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
      <path d="M2.75 3.5h3.5v9h-3.5z" fill="currentColor" stroke="none" opacity=".3" />
      <path d="M6.25 2.75v10.5" strokeDasharray="2 1.25" strokeLinecap="butt" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
      <path d="M9.75 3.5h3.5v9h-3.5z" fill="currentColor" stroke="none" opacity=".3" />
      <path d="M9.75 2.75v10.5" strokeDasharray="2 1.25" strokeLinecap="butt" />
    </>
  ),
  // A key to the board's lines: solid, stitched, folded.
  legend: (
    <>
      <path d="M2 4h4" />
      <path d="M2 8h4" strokeDasharray="1.25 1.25" strokeLinecap="butt" />
      <path d="M2 12h4" strokeDasharray="2 .75 .5 .75" strokeLinecap="butt" />
      <path d="M8.5 4h5.5M8.5 8h5.5M8.5 12h5.5" strokeWidth="1.25" />
    </>
  ),
  unsaved: dot(8, 8, 5),

  // The plain glyphs.
  select: <path d="M3.25 2.75 13 7.25l-4.25 1.5-1.5 4.5z" />,
  check: <path d="M3 8.5l3.25 3.25L13 5" />,
  // Three diamond holes, as a diamond iron leaves them.
  more: (
    <>
      {diamond(3.5, 8, 1.4)}
      {diamond(8, 8, 1.4)}
      {diamond(12.5, 8, 1.4)}
    </>
  ),
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  minus: <path d="M3.25 8h9.5" />,
  close: <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />,
  delete: (
    <>
      <path d="M2.5 4.25h11" />
      <path d="M6 4.25V3a.75.75 0 0 1 .75-.75h2.5A.75.75 0 0 1 10 3v1.25" />
      <path d="M3.75 4.25l.7 9.1a1 1 0 0 0 1 .9h5.1a1 1 0 0 0 1-.9l.7-9.1" />
      <path
        d={slit(5.6, 9.25, 1.2) + slit(8, 9.25, 1.2) + slit(10.4, 9.25, 1.2)}
        strokeWidth="1"
        strokeLinecap="butt"
      />
    </>
  ),
  rename: (
    <>
      <path d="M10.5 2.25l3.25 3.25-7.5 7.5-4 .75.75-4z" />
      <path d="M9 3.75l3.25 3.25" strokeWidth="1.25" />
    </>
  ),
  update: <path d="M8 13V3.5M4 7.5l4-4 4 4" />,
  warning: (
    <>
      <path d="M7.13 2.6a1 1 0 0 1 1.74 0l5.3 9.4a1 1 0 0 1-.87 1.5H2.7a1 1 0 0 1-.87-1.5z" />
      <path d="M8 6.25v3" />
      {dot(8, 11.4, 0.8)}
    </>
  ),
  'chevron-down': <path d="M4 6.25 8 10.25l4-4" />,
  'chevron-up': <path d="M4 9.75 8 5.75l4 4" />,
  'chevron-right': <path d="M6.25 4l4 4-4 4" />,
  'chevrons-left': <path d="M8 4.5 4.5 8 8 11.5M12 4.5 8.5 8l3.5 3.5" />,
  'chevrons-right': <path d="M4 4.5 7.5 8 4 11.5M8 4.5l3.5 3.5L8 11.5" />,

  // For the start screen, template picker and tab strip of the multi-window
  // work (8.12–8.14), which takes them up when it reaches develop.
  pin: pushPin,
  unpin: (
    <>
      {pushPin}
      {strike}
    </>
  ),
  'new-project': (
    <>
      {card}
      <path d="M8 7.75v4.5M5.75 10h4.5" />
    </>
  ),
  'from-template': (
    <>
      {card}
      <rect
        x="5.25"
        y="7.5"
        width="5.5"
        height="4.75"
        rx=".75"
        strokeWidth="1"
        strokeDasharray="1.2 1"
        strokeLinecap="butt"
      />
    </>
  ),
  open: (
    <>
      <path d="M1.75 12.25V3.75a1 1 0 0 1 1-1h3.1l1.5 1.75h5.9a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" />
      <path d="M4 10.75h8" strokeWidth="1" strokeDasharray="1.25 1.25" strokeLinecap="butt" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 14 14" strokeWidth="2" />
    </>
  ),
  menu: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />,
  'changed-outside': (
    <>
      {sheet}
      <path d="M8 4.75v4.25" />
      {dot(8, 11.5, 0.85)}
    </>
  ),
} satisfies Readonly<Record<IconName, ReactElement>>;

/**
 * One of LeatherCAD's icons, at `size` px, in the current colour: a state
 * changes its colour and never its shape. Its strokes stay 1.5 px at any size
 * (UI Foundations §10.1), as every `.icon`'s do.
 */
export function Icon({ of: name, size = 16 }: { of: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
