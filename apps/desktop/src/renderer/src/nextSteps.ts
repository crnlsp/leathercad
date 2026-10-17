import {
  addAllowance,
  addStitchHoles,
  addStitchLine,
  allowanceRefusal,
  type Command,
  type DocumentStore,
  type Selection,
} from '@leathercad/document';
import { evaluate, type Feature, type Part, type Problem, type Project } from '@leathercad/domain';

import { defaultIron, type MakerTools } from './irons.js';

/**
 * What a piece's stitching takes, in the order the work goes (R-14): a stitch
 * line, its holes, and the seam allowance — the cut edge outside the seam.
 */
export type StepId = 'stitchLine' | 'holes' | 'allowance';

/**
 * Where a step is: made, still to make, or made but not counted — failed,
 * with the problem Problems lists for it, or hidden, which the board's caption
 * does not count either (`stitchingOf`).
 */
export type Step =
  | { readonly id: StepId; readonly status: 'done' | 'todo' | 'hidden' }
  | { readonly id: StepId; readonly status: 'failed'; readonly problem: Problem };

/**
 * One piece's stitching, as a selection is about it: its outline, the stitch
 * line round it, and the holes on that line, each `null` until made.
 */
export interface StitchChain {
  readonly part: Part;
  readonly outline: Feature | null;
  readonly stitch: Feature | null;
  readonly holes: Feature | null;
}

const isOutline = (feature: Feature): boolean =>
  feature.kind === 'cut-contour' && feature.role === 'outer';

/** The feature a mirrored counterpart is the image of; itself when it is not one. */
const mirrorOf = (feature: Feature, byId: ReadonlyMap<string, Feature>): Feature | null =>
  feature.source.kind === 'derived' && feature.source.op.type === 'mirror'
    ? (byId.get(feature.source.sourceId) ?? null)
    : null;

/**
 * Whether `feature` is built from `source` — inset, grown, holes on it — or
 * is the mirror image of something built from what `source` is the image of.
 * A piece made by Mirror is derived from the original's features, in the
 * original's part: its stitch line is the image of the original's, and is
 * its own outline's as surely as the original's is the original's (ADR 0012).
 * Both must be images: a line mirrored across a fold is not the holes'
 * original line.
 */
function builtFrom(feature: Feature, source: Feature, byId: ReadonlyMap<string, Feature>): boolean {
  const { source: from } = feature;
  if (from.kind === 'derived' && from.op.type !== 'mirror' && from.sourceId === source.id) {
    return true;
  }
  const image = mirrorOf(feature, byId);
  const sourceImage = mirrorOf(source, byId);
  return image !== null && sourceImage !== null && builtFrom(image, sourceImage, byId);
}

/** Drawn by hand, or the mirror image of something that was. */
function drawn(feature: Feature, byId: ReadonlyMap<string, Feature>): boolean {
  const image = mirrorOf(feature, byId);
  return image === null ? feature.source.kind !== 'derived' : drawn(image, byId);
}

/**
 * The piece's stitching a selection is about (U.17), or `null` for none: an
 * outline, a stitch line or a hole set picked alone, or a piece picked by its
 * heading. Anything else — a fold, a cut-out, two things — has no bar.
 *
 * Read from the derivation graph, never an assumed order: the stitch line is
 * the one inset from the outline, or — drawn as *Stitch + allowance* — the
 * one the outline grows from; failing both, one drawn on the piece by hand,
 * as the sample's card pocket's is. Never one inset round a cut-out: that is
 * a window's stitching, not the piece's. A mirrored piece's own counterparts
 * count as its original's do (`builtFrom`), so it is never offered stitching
 * it already has.
 */
export function stitchChain(project: Project, selection: Selection): StitchChain | null {
  let part: Part | undefined;
  let picked: Feature | undefined;
  if (selection.features.size === 1 && selection.parts.size === 0) {
    const [id] = selection.features;
    part = project.parts.find((each) => each.features.some((f) => f.id === id));
    picked = part?.features.find((f) => f.id === id);
    if (
      picked === undefined ||
      !(isOutline(picked) || picked.kind === 'stitch-line' || picked.kind === 'stitch-hole-set')
    ) {
      return null;
    }
  } else if (selection.features.size === 0 && selection.parts.size === 1) {
    const [id] = selection.parts;
    part = project.parts.find((each) => each.id === id);
  }
  if (part === undefined) return null;

  const { features } = part;
  const byId = new Map(project.parts.flatMap((each) => each.features).map((f) => [f.id, f]));
  const from = (feature: Feature, source: Feature): boolean => builtFrom(feature, source, byId);
  const outline = features.find(isOutline) ?? null;
  const lines = features.filter((f) => f.kind === 'stitch-line');
  const stitch =
    picked?.kind === 'stitch-line'
      ? picked
      : picked?.kind === 'stitch-hole-set'
        ? (lines.find((line) => from(picked, line)) ?? null)
        : outline === null
          ? (lines[0] ?? null)
          : (lines.find((line) => from(line, outline) || from(outline, line)) ??
            lines.find((line) => drawn(line, byId)) ??
            null);
  const holes =
    picked?.kind === 'stitch-hole-set'
      ? picked
      : stitch === null
        ? null
        : (features.find((f) => f.kind === 'stitch-hole-set' && from(f, stitch)) ?? null);

  if (outline === null && stitch === null) return null;
  return { part, outline, stitch, holes };
}

/**
 * Stitch line › Stitch holes › Seam allowance, each done or not. The first
 * not done is the one the bar offers — when it is still to make: one that
 * failed, or is hidden, is said instead, and nothing after it is offered.
 *
 * Made means evaluated and on the board: a stitch line its margin left no
 * room for is not stitching, and holes made on it would fail too; a hidden
 * hole set is neither counted nor printed. The allowance is the leather
 * between the edge and the seam, so it is there once a piece has both —
 * whichever was drawn first. A piece drawn outline first has it at its margin
 * the moment its stitch line is made; adding one would give it a second
 * outline, which a piece cannot have.
 */
export function nextSteps(project: Project, chain: StitchChain): readonly Step[] {
  const resolved = new Map(
    evaluate(project)
      .parts.flatMap((part) => part.features)
      .map((entry) => [entry.feature.id, entry] as const),
  );
  // Only a hole set's visibility counts against it: a hidden stitch line's
  // holes are still drawn, and a hidden outline is still the piece.
  const of = (id: StepId, feature: Feature | null, hides = false): Step => {
    if (feature === null) return { id, status: 'todo' };
    const entry = resolved.get(feature.id);
    if (entry?.ok === false) return { id, status: 'failed', problem: entry.problem };
    return { id, status: hides && !feature.visible ? 'hidden' : 'done' };
  };
  return [
    of('stitchLine', chain.stitch),
    of('holes', chain.holes, true),
    chain.stitch === null ? { id: 'allowance', status: 'todo' } : of('allowance', chain.outline),
  ];
}

/** Why a step cannot be made, as the panel's button says it; `null` when it can. */
export function stepRefusal(project: Project, chain: StitchChain, step: StepId): Problem | null {
  return step === 'allowance' && chain.stitch !== null
    ? allowanceRefusal(project, chain.stitch.id)
    : null;
}

/** A stitch line at the maker's margin, inside `sourceId` (U.13). */
export function stitchLineCommand(
  partId: string,
  sourceId: string,
  id: string,
  tools: MakerTools,
): Command {
  return addStitchLine(partId, id, sourceId, tools.stitchMarginMm);
}

/** Holes from the maker's default iron, its pitch and its name; with no irons, the project's. */
export function holesCommand(
  partId: string,
  stitchId: string,
  id: string,
  tools: MakerTools,
): Command {
  const iron = defaultIron(tools);
  return addStitchHoles(partId, id, stitchId, {
    mode: 'fit-whole',
    corners: 'hole-at-corner',
    ...(iron === undefined ? {} : { pitchMm: iron.pitchMm, ironLabel: iron.name }),
  });
}

/** The cut edge, the maker's margin outside the seam. */
export function allowanceCommand(
  partId: string,
  stitchId: string,
  id: string,
  tools: MakerTools,
): Command {
  return addAllowance(partId, id, stitchId, tools.stitchMarginMm);
}

/**
 * Makes something from what is selected, as Properties' actions and the
 * selection bar's step both do: one command, one undo step, and the new
 * feature selected, so Properties shows what it came out as.
 */
export function derive(
  store: DocumentStore,
  nextId: () => string,
  make: (id: string) => Command,
): void {
  const id = nextId();
  store.dispatch(make(id));
  store.select([id]);
}

/** The bar's one click: `step`, made on this piece with My tools' values. */
export function runStep(
  store: DocumentStore,
  nextId: () => string,
  chain: StitchChain,
  step: StepId,
  tools: MakerTools,
): void {
  const { part, outline, stitch } = chain;
  if (step === 'stitchLine') {
    if (outline !== null)
      derive(store, nextId, (id) => stitchLineCommand(part.id, outline.id, id, tools));
  } else if (stitch !== null) {
    const make = step === 'holes' ? holesCommand : allowanceCommand;
    derive(store, nextId, (id) => make(part.id, stitch.id, id, tools));
  }
}
