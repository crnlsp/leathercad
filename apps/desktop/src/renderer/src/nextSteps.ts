import {
  addAllowance,
  addStitchHoles,
  addStitchLine,
  allowanceRefusal,
  type Command,
  type DocumentStore,
  type Selection,
} from '@leathercad/document';
import type { Feature, Part, Problem, Project } from '@leathercad/domain';

import { defaultIron, type MakerTools } from './irons.js';

/**
 * What a piece's stitching takes, in the order the work goes (R-14): a stitch
 * line, its holes, and the seam allowance — the cut edge outside the seam.
 */
export type StepId = 'stitchLine' | 'holes' | 'allowance';

export interface Step {
  readonly id: StepId;
  readonly done: boolean;
}

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

/** Whether `feature` is built from `sourceId`. */
const follows = (feature: Feature, sourceId: string): boolean =>
  feature.source.kind === 'derived' && feature.source.sourceId === sourceId;

/**
 * The piece's stitching a selection is about (U.17), or `null` for none: an
 * outline, a stitch line or a hole set picked alone, or a piece picked by its
 * heading. Anything else — a fold, a cut-out, two things — has no bar.
 *
 * Read from the derivation graph, never an assumed order: the stitch line is
 * the one inset from the outline, or — drawn as *Stitch + allowance* — the
 * one the outline grows from; failing both, one drawn on the piece by hand,
 * as the sample's card pocket's is. Never one inset round a cut-out: that is
 * a window's stitching, not the piece's.
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
  const outline = features.find(isOutline) ?? null;
  const lines = features.filter((f) => f.kind === 'stitch-line');
  const stitch =
    picked?.kind === 'stitch-line'
      ? picked
      : picked?.kind === 'stitch-hole-set'
        ? (lines.find((line) => follows(picked, line.id)) ?? null)
        : outline === null
          ? (lines[0] ?? null)
          : (lines.find((line) => follows(line, outline.id) || follows(outline, line.id)) ??
            lines.find((line) => line.source.kind !== 'derived') ??
            null);
  const holes =
    picked?.kind === 'stitch-hole-set'
      ? picked
      : stitch === null
        ? null
        : (features.find((f) => f.kind === 'stitch-hole-set' && follows(f, stitch.id)) ?? null);

  if (outline === null && stitch === null) return null;
  return { part, outline, stitch, holes };
}

/**
 * Stitch line › Stitch holes › Seam allowance, each done or not. The first
 * not done is the one the bar offers.
 *
 * The allowance is the leather between the edge and the seam, so it is there
 * once a piece has both — whichever was drawn first. A piece drawn outline
 * first has it at its margin the moment its stitch line is made; adding one
 * would give it a second outline, which a piece cannot have.
 */
export function nextSteps(chain: StitchChain): readonly Step[] {
  return [
    { id: 'stitchLine', done: chain.stitch !== null },
    { id: 'holes', done: chain.holes !== null },
    { id: 'allowance', done: chain.stitch !== null && chain.outline !== null },
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
