import { EPS_ANGLE, approxEq } from '@leathercad/core';
import {
  derivationRefusal,
  evaluate,
  problem,
  type Derivation,
  type Feature,
  type Project,
  type Run,
} from '@leathercad/domain';

export function offsetRunAnchors(project: Project, feature: Feature): number[] {
  const source = feature.source;
  if (source.kind !== 'derived') return [];
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === source.sourceId);
  return entry?.ok === true
    ? entry.anchors.flatMap((distance, i) => (distance === null ? [] : [i]))
    : [];
}

export function offsetRunRefusal(
  project: Project,
  feature: Feature,
  op: Extract<Derivation, { type: 'offset' }>,
) {
  if (
    feature.kind === 'text-label' ||
    feature.kind === 'measurement' ||
    feature.source.kind !== 'derived'
  )
    return problem('NOT_DERIVED', { featureId: feature.id, featureName: feature.name });
  return derivationRefusal(project, { ...feature, source: { ...feature.source, op } });
}

export type OpenSide = 'top' | 'bottom' | 'left' | 'right';
type Between = Extract<Run, { kind: 'between' }>;

/**
 * The four runs that stitch three sides of a rectangle, named by the side they
 * leave open as the board shows it (Q48) — or null when the line does not
 * follow a rectangle lying square to the board.
 *
 * A rectangle's corners are numbered in its own frame, anticlockwise from the
 * bottom right (domain `anchors.ts`), and a run goes anticlockwise from its
 * first corner to its second; so leaving the side from corner `j` to corner
 * `j + 1` open is the run from `j + 1` round to `j`. Turned by whole quarter
 * turns, each side faces the board's side that many places further round. A
 * rectangle at any other angle has no top, and offers only the numbered
 * corners. A mirror needs nothing here: it keeps the frame the same way up.
 */
export function openSides(project: Project, feature: Feature): [OpenSide, Between][] | null {
  const source = feature.source;
  if (source.kind !== 'derived' || source.op.type !== 'offset') return null;
  const outline = project.parts
    .flatMap((p) => p.features)
    .find((f) => f.id === source.sourceId)?.source;
  if (outline?.kind !== 'shape' || outline.shape.type !== 'rect') return null;
  const quarters = outline.shape.rotation / (Math.PI / 2);
  const turned = Math.round(quarters);
  if (!approxEq(quarters, turned, EPS_ANGLE)) return null;
  // The board's sides in the frame's order, anticlockwise from the right.
  const round: OpenSide[] = ['right', 'top', 'left', 'bottom'];
  const runFor = (side: OpenSide): Between => {
    const j = (((round.indexOf(side) - turned) % 4) + 4) % 4;
    return { kind: 'between', fromAnchor: (j + 1) % 4, toAnchor: j };
  };
  return (['top', 'bottom', 'left', 'right'] as const).map((side) => [side, runFor(side)]);
}
