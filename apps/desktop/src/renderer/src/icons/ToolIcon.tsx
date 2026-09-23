import { MousePointer2, Type } from 'lucide-react';
import type { ReactElement } from 'react';

import { Icon } from './Icon.js';
import { FeatureMark } from './marks.js';

/** A construction node: where the tool's shape is fixed by a click. */
function Node({ x, y }: { x: number; y: number }) {
  return (
    <rect x={x - 1.25} y={y - 1.25} width="2.5" height="2.5" fill="currentColor" stroke="none" />
  );
}

/**
 * The geometry tools, drawn in Lucide's visual language (ADR 0017) — 1.5 px
 * stroke, round caps, the current colour — and each showing its
 * **construction nodes**: the corners, the centre and rim, the arc's three
 * points. That is the drafting convention that tells *the tool* from *a
 * rectangle*, and what gives the set its family resemblance to the marks
 * (decisions §4.2).
 */
const GEOMETRY: Readonly<Record<string, ReactElement>> = {
  rectangle: (
    <>
      <rect x="3" y="4.5" width="10" height="7" />
      <Node x={3} y={4.5} />
      <Node x={13} y={11.5} />
    </>
  ),
  circle: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 8h5" strokeWidth="1" />
      <Node x={8} y={8} />
      <Node x={13} y={8} />
    </>
  ),
  arc: (
    <>
      <path d="M3 11.5a5 5 0 0 1 10 0" />
      <Node x={3} y={11.5} />
      <Node x={13} y={11.5} />
      <Node x={8} y={6.5} />
    </>
  ),
  line: (
    <>
      <path d="M3.5 12.5 12.5 3.5" />
      <Node x={3.5} y={12.5} />
      <Node x={12.5} y={3.5} />
    </>
  ),
  polyline: (
    <>
      <path d="M2.5 12 6 5l4 5.5 3.5-6.5" />
      <Node x={2.5} y={12} />
      <Node x={6} y={5} />
      <Node x={10} y={10.5} />
      <Node x={13.5} y={4} />
    </>
  ),
  // A turn about a pivot: the pivot is the node.
  rotate: (
    <>
      <path d="M12.5 8A4.5 4.5 0 1 1 8 3.5" />
      <path d="M6.5 1.5 8.5 3.5 6.5 5.5" />
      <Node x={8} y={8} />
    </>
  ),
  // A box and its corner handles.
  scale: (
    <>
      <rect x="4" y="4" width="8" height="8" strokeDasharray="2 1.5" strokeLinecap="butt" />
      <Node x={4} y={4} />
      <Node x={12} y={4} />
      <Node x={4} y={12} />
      <Node x={12} y={12} />
    </>
  ),
};

/**
 * The icon for a mode in the tool rail (decisions §4.2). Generic geometry gets
 * a geometry icon; Hardware and Measure get their LeatherCAD marks, in the
 * current colour so the rail's state colours apply to them too.
 */
export function ToolIcon({ toolId, size = 16 }: { toolId: string; size?: number }) {
  if (toolId === 'select') return <Icon of={MousePointer2} size={size} />;
  if (toolId === 'text') return <Icon of={Type} size={size} />;
  if (toolId === 'hardware') return <FeatureMark mark="hardware-hole" size={size} tone="current" />;
  if (toolId === 'measure') return <FeatureMark mark="measurement" size={size} tone="current" />;

  const drawing = GEOMETRY[toolId];
  if (drawing === undefined) return null;
  return (
    <svg
      className="icon"
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
      {drawing}
    </svg>
  );
}
