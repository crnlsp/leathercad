import { ROLE_STYLES, SHELL, GROUND } from '@leathercad/render';
import type { Feature, LayerRole } from '@leathercad/domain';
import { Type } from 'lucide-react';
import { useId, type ReactElement } from 'react';

import { Icon } from './Icon.js';
import { markFor, type Mark } from './markFor.js';

/** Where a mark is drawn, which decides the value its hue takes (decisions §3). */
export type Plane = 'shell' | 'ground';

/**
 * The relative weight order, which is invariant (decisions §3): cut heaviest,
 * then hardware, then stitch and fold, then marking and annotation. Stroke
 * widths in the 16 px box.
 */
const WEIGHT: Readonly<Record<LayerRole, number>> = {
  cut: 2,
  hardware: 1.75,
  stitch: 1.5,
  'stitch-holes': 1.5,
  fold: 1.5,
  mark: 1.25,
  annotation: 1.25,
  construction: 1,
};

/**
 * The dash rhythms, as ratios of the canvas's millimetre rhythms. The ratio is
 * the invariant; the length is scaled to fit 16 px. Butt caps, because a round
 * cap lengthens every dash and would change the ratio it exists to show.
 */
const DASH: Partial<Record<LayerRole, string>> = {
  stitch: '2 2',
  fold: '5.6 1.6 1.2 1.6',
  mark: '1 1.5',
};

type Ink = (role: LayerRole) => string;

/** Each mark, drawn once at 16 px (UI Foundations §10.3). */
const DRAWINGS: Readonly<Record<Mark, (ink: Ink, neutral: string, uid: string) => ReactElement>> = {
  // A pattern card with one clipped corner: the piece itself.
  piece: (_ink, neutral) => (
    <>
      <path d="M3 2.5h7.5l3 3v8H3z" stroke={neutral} strokeWidth={1.25} strokeLinejoin="round" />
      <path d="M10.5 2.5v3h3" stroke={neutral} strokeWidth={1.25} strokeLinejoin="round" />
    </>
  ),
  'cut-edge': (ink) => (
    <rect
      x="3"
      y="3"
      width="10"
      height="10"
      rx="1.5"
      stroke={ink('cut')}
      strokeWidth={WEIGHT.cut}
    />
  ),
  // Removal, not boundary: the inward hatch carries it, so it survives
  // greyscale and colour-blindness (§8.2).
  'cut-out': (ink, _neutral, uid) => (
    <>
      <clipPath id={`${uid}-clip`}>
        <rect x="3.5" y="3.5" width="9" height="9" />
      </clipPath>
      <g clipPath={`url(#${uid}-clip)`} stroke={ink('cut')} strokeWidth={1} opacity={0.45}>
        <path d="M1 8 8 1M1 13 13 1M4 15 15 4M9 15 15 9" />
      </g>
      <rect x="3" y="3" width="10" height="10" rx="1" stroke={ink('cut')} strokeWidth={1.75} />
    </>
  ),
  'stitch-line': (ink) => (
    <rect
      x="3"
      y="3"
      width="10"
      height="10"
      rx="1.5"
      stroke={ink('stitch')}
      strokeWidth={WEIGHT.stitch}
      strokeDasharray={DASH.stitch}
      strokeLinecap="butt"
    />
  ),
  // Three slits at the iron's slant: three here, eighty on the canvas (§3).
  'stitch-holes': (ink) => (
    <path
      d="M3.5 11.5 5.5 5.5M7 11.5 9 5.5M10.5 11.5 12.5 5.5"
      stroke={ink('stitch-holes')}
      strokeWidth={WEIGHT['stitch-holes']}
      strokeLinecap="round"
    />
  ),
  // The fold's own rhythm, with ticks: toward the viewer for a valley…
  'fold-valley': (ink) => (
    <>
      <path
        d="M8 2v12"
        stroke={ink('fold')}
        strokeWidth={WEIGHT.fold}
        strokeDasharray={DASH.fold}
        strokeLinecap="butt"
      />
      <path
        d="M4.5 6 8 9l3.5-3"
        stroke={ink('fold')}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  // …and away from it for a mountain.
  'fold-mountain': (ink) => (
    <>
      <path
        d="M8 2v12"
        stroke={ink('fold')}
        strokeWidth={WEIGHT.fold}
        strokeDasharray={DASH.fold}
        strokeLinecap="butt"
      />
      <path
        d="M4.5 10 8 7l3.5 3"
        stroke={ink('fold')}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  marking: (ink) => (
    <path
      d="M2.5 11c2.5-6 6.5 2 11-6"
      stroke={ink('mark')}
      strokeWidth={WEIGHT.mark}
      strokeDasharray={DASH.mark}
      strokeLinecap="butt"
    />
  ),
  // The cut edge, the stitch line inside it, and the allowance between them.
  'seam-allowance': (ink) => (
    <>
      <rect x="2.5" y="4.5" width="11" height="6.5" fill={ink('cut')} opacity={0.2} />
      <path d="M2.5 4.5h11" stroke={ink('cut')} strokeWidth={WEIGHT.cut} />
      <path
        d="M2.5 11h11"
        stroke={ink('stitch')}
        strokeWidth={WEIGHT.stitch}
        strokeDasharray={DASH.stitch}
        strokeLinecap="butt"
      />
    </>
  ),
  // A shape and its reflection across the fold.
  'mirror-across-fold': (ink) => (
    <>
      <path
        d="M8 1.5v13"
        stroke={ink('fold')}
        strokeWidth={1.25}
        strokeDasharray={DASH.fold}
        strokeLinecap="butt"
      />
      <path
        d="M2.5 4.5 6 8l-3.5 3.5z"
        stroke={ink('cut')}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M13.5 4.5 10 8l3.5 3.5z"
        stroke={ink('cut')}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </>
  ),
  'hardware-hole': (ink) => (
    <>
      <circle cx="8" cy="8" r="4.75" stroke={ink('hardware')} strokeWidth={WEIGHT.hardware} />
      <path
        d="M8 5.75v4.5M5.75 8h4.5"
        stroke={ink('hardware')}
        strokeWidth={1}
        strokeLinecap="round"
      />
    </>
  ),
  measurement: (ink) => (
    <>
      <path
        d="M2.5 4v8M13.5 4v8"
        stroke={ink('annotation')}
        strokeWidth={1}
        strokeLinecap="round"
      />
      <path d="M4 8h8" stroke={ink('annotation')} strokeWidth={WEIGHT.annotation} />
      <path d="M3 8 6 6.25v3.5zM13 8l-3-1.75v3.5z" fill={ink('annotation')} />
    </>
  ),
};

/**
 * A LeatherCAD mark (UI Foundations §10.3, F.6) — the one component that names
 * a line wherever it is named: the parts tree, the property header, a problem
 * row, a *Draw as* chip, and (F.7) the legend.
 *
 * `tone="role"` draws it in the hue of the line it names, at the plane's value.
 * `tone="current"` draws it in the text colour, for the tool rail, where state
 * is shown by colour (§10.1) and the rail's own rest, hover and active apply.
 */
export function FeatureMark({
  mark,
  size = 16,
  plane = 'shell',
  tone = 'role',
}: {
  mark: Mark;
  size?: number;
  plane?: Plane;
  tone?: 'role' | 'current';
}) {
  // An id per rendered mark: a tree of cut-outs must not repeat one.
  const uid = useId();
  const ink: Ink =
    tone === 'current'
      ? () => 'currentColor'
      : (role) => (plane === 'shell' ? ROLE_STYLES[role].shell : ROLE_STYLES[role].colour);
  const neutral =
    tone === 'current' ? 'currentColor' : plane === 'shell' ? SHELL.textDim : GROUND.ink;

  return (
    <svg
      className="feature-mark"
      data-mark={mark}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {DRAWINGS[mark](ink, neutral, uid)}
    </svg>
  );
}

/**
 * The mark for a feature — or, for a text label, the Tier 1 type icon: a label
 * is type, not a leather line. The one lookup every surface uses, so the tree,
 * the property header and a problem row can never name a feature differently.
 */
export function MarkOf({ feature, size = 16 }: { feature: Feature; size?: number }) {
  const mark = markFor(feature);
  if (mark === null) {
    return (
      <span className="feature-mark text-mark" data-mark="text">
        <Icon of={Type} size={size} />
      </span>
    );
  }
  return <FeatureMark mark={mark} size={size} />;
}
