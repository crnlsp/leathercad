import {
  acceptWarning,
  addDrawnStitchLine,
  addHardwareHole,
  addPart,
  addSeam,
  addStitchHoles,
  addStitchLine,
  pathPart,
  rectShape,
  setDerivation,
  setPocketRequirement,
  setShape,
  shapePart,
  transformFeatures,
  translateFeatures,
  type Command,
  unacceptWarning,
} from '@leathercad/document';
import {
  diagnose,
  findFeature,
  problemKey,
  type ProblemCode,
  type Derivation,
  type Feature,
  type FeatureId,
  type PartId,
  type PocketRequirement,
  type Project,
  type Seam,
} from '@leathercad/domain';
import { MatOps, PathOps, type Vec2 } from '@leathercad/geometry';

/**
 * A maker's actions, named as a maker would say them, each the command the app
 * itself dispatches for it. Ids follow one pattern so a scenario reads as a
 * story: a piece `pocket` has `pocket-outline`, `pocket-stitch` and
 * `pocket-holes`.
 */

export const outlineOf = (piece: string): FeatureId => `${piece}-outline`;
export const stitchOf = (piece: string): FeatureId => `${piece}-stitch`;
export const holesOf = (piece: string): FeatureId => `${piece}-holes`;

export const at = (x: number, y: number): Vec2 => ({ x, y });

/** The Rectangle tool's commit, in Outline mode: a new piece cut to a rectangle (`commitDrawn`). */
export function drawRectangle(
  piece: string,
  rect: { x: number; y: number; width: number; height: number; radius?: number; name?: string },
): Command {
  return addPart(
    shapePart(
      piece as PartId,
      outlineOf(piece),
      rect.name ?? 'Panel',
      rectShape(at(rect.x, rect.y), rect.width, rect.height, rect.radius ?? 0),
    ),
  );
}

/** The Polyline tool's commit, closed, in Outline mode: a piece cut to a drawn outline. */
export function drawOutline(piece: string, points: readonly Vec2[], name = 'Panel'): Command {
  return addPart(
    pathPart(piece as PartId, outlineOf(piece), name, PathOps.polyline([...points], true)),
  );
}

/** *Stitch line* from the selection bar: inset from the outline all round. */
export function stitchAllRound(piece: string, insetMm: number): Command {
  return addStitchLine(piece as PartId, stitchOf(piece), outlineOf(piece), insetMm);
}

/**
 * The corners that leave one side of an unrotated rectangle unstitched — what
 * a maker picks in *Stitched sides › Between corners*. A rectangle's corners
 * run from its bottom right anticlockwise; the harness's own test holds this
 * table to the geometry it makes.
 */
const OPEN_SIDE = {
  top: { fromAnchor: 2, toAnchor: 1 },
  bottom: { fromAnchor: 0, toAnchor: 3 },
  left: { fromAnchor: 3, toAnchor: 2 },
  right: { fromAnchor: 1, toAnchor: 0 },
} as const;

export type Side = keyof typeof OPEN_SIDE;

/** Stitched on three sides, inset from the outline, the fourth left open: a pocket's stitching. */
export function stitchLeavingOpen(piece: string, open: Side, insetMm: number): Command {
  return addStitchLine(piece as PartId, stitchOf(piece), outlineOf(piece), insetMm, {
    kind: 'between',
    ...OPEN_SIDE[open],
  });
}

/** *Stitched sides › Between corners* on stitching already there: one side left open. */
export function openStitching(piece: string, open: Side) {
  return (project: Project): Command => {
    const stitch = featureIn(project, stitchOf(piece));
    if (stitch.source.kind !== 'derived' || stitch.source.op.type !== 'offset') {
      throw new Error(`${piece}'s stitching is not inset from its outline`);
    }
    return setDerivation(stitch.id, {
      ...stitch.source.op,
      run: { kind: 'between', ...OPEN_SIDE[open] },
    });
  };
}

/** A stitch line drawn by hand, open, through these points. */
export function drawStitching(piece: string, points: readonly Vec2[]): Command {
  return addDrawnStitchLine(piece as PartId, stitchOf(piece), {
    kind: 'path',
    path: PathOps.polyline([...points], false),
  });
}

/** *Stitch holes*: the iron's holes along the piece's stitch line. */
export function punchHoles(
  piece: string,
  op?: Partial<Extract<Derivation, { type: 'stitch-holes' }>>,
): Command {
  return addStitchHoles(piece as PartId, holesOf(piece), stitchOf(piece), op);
}

/**
 * Holes from a stitch line's very ends: *Start offset* and *End offset* typed
 * as 0, as a project saved before U2 has them. On a square-cornered piece
 * stitched open, its end holes then sit on the open edge.
 */
export const FROM_THE_VERY_ENDS = { startOffsetMm: 0, endOffsetMm: 0 } as const;

/** *Holds › Credit card* in Properties, with the maker's ease and whether it goes in fully. */
export function holdsCard(stitch: FeatureId, easeMm: number, fully = false): Command {
  return setPocketRequirement(stitch, { content: { kind: 'id-1' }, easeMm, fully });
}

/** *Holds › Another size*: width across the opening, height into the pocket. */
export function holdsSize(
  stitch: FeatureId,
  size: { widthMm: number; heightMm: number },
  easeMm: number,
  fully = false,
): Command {
  return setPocketRequirement(stitch, { content: { kind: 'size', ...size }, easeMm, fully });
}

/** *Accept* on the `code` warning about `on`, in Properties (9.16). */
export function accept(code: ProblemCode, on: FeatureId) {
  return (project: Project): Command => acceptWarning(keyOf(project, code, on));
}

/** *Un-accept* on it. */
export function unaccept(code: ProblemCode, on: FeatureId) {
  return (project: Project): Command => unacceptWarning(keyOf(project, code, on));
}

function keyOf(project: Project, code: ProblemCode, on: FeatureId): string {
  const found = diagnose(project).find((d) => d.problem.code === code && d.featureId === on);
  if (found === undefined) throw new Error(`no ${code} on ${on} to accept`);
  return problemKey(found.problem);
}

/** Any requirement, as the editor commits it. */
export function holds(stitch: FeatureId, requirement: PocketRequirement): Command {
  return setPocketRequirement(stitch, requirement);
}

/** *Holds › Nothing stated*. */
export function statesNothing(stitch: FeatureId): Command {
  return setPocketRequirement(stitch, undefined);
}

function featureIn(project: Project, id: FeatureId): Feature {
  const found = findFeature(project, id);
  if (found === null) throw new Error(`no feature ${id} in the project`);
  return found.feature;
}

/** Typing a new width or height into the outline's fields in Properties. */
export function resize(piece: string, size: { width?: number; height?: number }) {
  return (project: Project): Command => {
    const outline = featureIn(project, outlineOf(piece));
    if (outline.source.kind !== 'shape' || outline.source.shape.type !== 'rect') {
      throw new Error(`${piece} is not cut to a rectangle`);
    }
    return setShape(outline.id, { ...outline.source.shape, ...size });
  };
}

/** Typing a new *Edge margin* for the piece's stitch line. */
export function setInset(piece: string, insetMm: number) {
  return (project: Project): Command => {
    const stitch = featureIn(project, stitchOf(piece));
    if (stitch.source.kind !== 'derived' || stitch.source.op.type !== 'offset') {
      throw new Error(`${piece}'s stitching is not inset from its outline`);
    }
    return setDerivation(stitch.id, { ...stitch.source.op, distanceMm: insetMm });
  };
}

/** Typing a new *Iron* pitch or *Corners* policy for a hole set. */
export function setHoles(
  holeSet: FeatureId,
  change: Partial<Extract<Derivation, { type: 'stitch-holes' }>>,
) {
  return (project: Project): Command => {
    const holes = featureIn(project, holeSet);
    if (holes.source.kind !== 'derived' || holes.source.op.type !== 'stitch-holes') {
      throw new Error(`${holeSet} is not a hole set`);
    }
    return setDerivation(holes.id, { ...holes.source.op, ...change });
  };
}

/** What moves when a whole piece is dragged or turned: what is not derived from something else. */
function drawnFeaturesOf(project: Project, piece: string): FeatureId[] {
  const part = project.parts.find((p) => p.id === piece);
  if (part === undefined) throw new Error(`no piece ${piece}`);
  return part.features.filter((f) => f.source.kind !== 'derived').map((f) => f.id);
}

/** Dragging a whole piece by this much. */
export function movePiece(piece: string, by: Vec2) {
  return (project: Project): Command => translateFeatures(drawnFeaturesOf(project, piece), by);
}

/** The Rotate tool on a whole piece, about a point. */
export function turnPiece(piece: string, angleRad: number, about: Vec2) {
  return (project: Project): Command =>
    transformFeatures(drawnFeaturesOf(project, piece), MatOps.fromRotationAround(about, angleRad), {
      action: 'rotate',
    });
}

/** *Sew together…*, committed. */
export function sew(seam: Seam): Command {
  return addSeam(seam);
}

/** The Hardware tool: a punched hole of this diameter, for a rivet unless said. */
export function punchHardware(piece: string, id: string, centre: Vec2, diameterMm: number) {
  return addHardwareHole(piece as PartId, id, centre, diameterMm / 2);
}
