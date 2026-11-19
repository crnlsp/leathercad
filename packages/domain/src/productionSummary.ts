import { EPS_LENGTH, quantise, type Mm } from '@leathercad/core';
import { PathOps } from '@leathercad/geometry';

import type { ResolvedProject } from './evaluate.js';
import type { FeatureId, HardwareHole, PartId } from './feature.js';
import { materialOf } from './material.js';
import { turnedOver } from './mirroredPair.js';
import { resolveSeam } from './seams.js';

/**
 * Thread, as makers quote it: four times the length stitched, rounded up to the
 * next 10 cm (product-roadmap decision 8). An estimate — it knows nothing of
 * thickness, stitch style or waste — and the app says so, with this rule.
 */
export const THREAD_STITCH_FACTOR = 4;
export const THREAD_ROUND_MM: Mm = 100;

export interface ProductionPiece {
  readonly partId: PartId;
  readonly name: string;
  readonly quantity: number;
  /** Of the quantity, how many are cut with the template turned over (Q21). */
  readonly turnedOver: number;
  /** Holes in one piece: stitch holes and rows of holes, as the job's totals count them. */
  readonly holes: number;
  /** One piece's leather: the outline's area less its cut-outs. Never negative. */
  readonly areaMm2: number;
}

/** Punched holes of one type and size, wherever they are. */
export interface HardwareLine {
  readonly hardwareType: HardwareHole['hardwareType'];
  readonly diameterMm: Mm;
  /** Every hole, every piece cut included. */
  readonly holes: number;
  /** What to buy: a pair of holes that meet across a fold takes one rivet, not two. */
  readonly pieces: number;
}

/**
 * What the pattern asks of the bench, computed from the evaluated project and
 * never stored (invariant 4). Numbers only: the app words them (ADR 0018).
 *
 * A piece is **cut** when it has a visible, closed outer outline, as the sheets
 * print one; a label, a hidden or an open outline is not leather. Everything
 * here counts cut pieces only, each times its quantity.
 */
export interface ProductionSummary {
  /** Cut pieces, in the parts list's order. */
  readonly pieces: readonly ProductionPiece[];
  /** Pieces to cut, each times its quantity. */
  readonly toCut: number;
  /** Holes to punch, each set times its piece's quantity. */
  readonly holes: number;
  readonly hardware: readonly HardwareLine[];
  /** Length to stitch, a seam's stretch counted once (see `stitchingOf`). */
  readonly stitchingMm: Mm;
  /** **An estimate**: `THREAD_STITCH_FACTOR` × stitching, rounded up to `THREAD_ROUND_MM`. */
  readonly threadMm: Mm;
  /** Net leather, never "how much to buy": waste, grain and flaws are the maker's. */
  readonly leatherMm2: number;
}

export function productionSummary(resolved: ResolvedProject): ProductionSummary {
  const pieces: ProductionPiece[] = [];
  const hardware = new Map<string, HardwareLine>();
  const sets = new Map<FeatureId, StitchedSet>();

  for (const part of resolved.parts) {
    const { quantity } = part.part;
    const outer = part.features.find(
      (entry) => entry.ok && entry.feature.kind === 'cut-contour' && entry.feature.role === 'outer',
    );
    if (outer === undefined || !outer.ok || !outer.feature.visible || !outer.path.closed) continue;

    let holes = 0;
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible) continue;
      holes += entry.holes?.count ?? 0;
      if (entry.feature.kind === 'stitch-hole-set') {
        sets.set(entry.feature.id, { lengthMm: PathOps.length(entry.path), quantity });
      } else if (entry.feature.kind === 'hardware-hole') {
        const box = PathOps.bbox(entry.path);
        if (box === null) continue;
        const diameterMm = quantise(box.maxX - box.minX);
        const key = `${entry.feature.hardwareType}/${String(diameterMm)}`;
        const known = hardware.get(key);
        const folded = isFoldMirror(entry.feature);
        hardware.set(key, {
          hardwareType: entry.feature.hardwareType,
          diameterMm,
          holes: (known?.holes ?? 0) + quantity,
          pieces: (known?.pieces ?? 0) + (folded ? 0 : quantity),
        });
      }
    }

    const material = materialOf(part);
    const cutOut = material.holes.reduce(
      (sum, hole) => sum + (hole.closed ? PathOps.area(hole) : 0),
      0,
    );
    pieces.push({
      partId: part.part.id,
      name: part.part.name,
      quantity,
      turnedOver: turnedOver(part.part),
      holes,
      areaMm2: Math.max(0, PathOps.area(outer.path) - cutOut),
    });
  }

  const stitchingMm = stitchingOf(resolved, sets);
  return {
    pieces,
    toCut: sum(pieces, (p) => p.quantity),
    holes: sum(pieces, (p) => p.holes * p.quantity),
    hardware: [...hardware.values()].sort(
      (a, b) => a.hardwareType.localeCompare(b.hardwareType) || a.diameterMm - b.diameterMm,
    ),
    stitchingMm,
    threadMm:
      stitchingMm <= EPS_LENGTH
        ? 0
        : Math.ceil((THREAD_STITCH_FACTOR * stitchingMm - EPS_LENGTH) / THREAD_ROUND_MM) *
          THREAD_ROUND_MM,
    leatherMm2: sum(pieces, (p) => p.areaMm2 * p.quantity),
  };
}

interface StitchedSet {
  readonly lengthMm: Mm;
  readonly quantity: number;
}

/**
 * Where the needle goes: every hole set's line times its piece's quantity — but
 * a seam sews two sets with one thread, so its stretch counts once, for as many
 * times as both pieces are cut (the one cut more often rides along through the
 * same holes: two pockets on one outer). What a seam leaves of a set counts as
 * the set on its own.
 */
function stitchingOf(resolved: ResolvedProject, sets: ReadonlyMap<FeatureId, StitchedSet>): Mm {
  const covered = new Map<FeatureId, Mm>();
  let total = 0;

  for (const seam of resolved.project.seams ?? []) {
    const walked = resolveSeam(resolved.project, seam);
    const a = sets.get(seam.a.holeSetId);
    const b = sets.get(seam.b.holeSetId);
    if (!walked.ok || a === undefined || b === undefined) continue;
    const stretchMm = Math.max(walked.a.lengthMm, walked.b.lengthMm);
    total += stretchMm * Math.min(a.quantity, b.quantity);
    for (const id of [seam.a.holeSetId, seam.b.holeSetId]) {
      covered.set(id, (covered.get(id) ?? 0) + stretchMm);
    }
  }

  for (const [id, set] of sets) {
    total += Math.max(0, set.lengthMm - (covered.get(id) ?? 0)) * set.quantity;
  }
  return total;
}

/** A hole that is the other side of a fold from a hole already counted. */
function isFoldMirror(feature: HardwareHole): boolean {
  const { source } = feature;
  return source.kind === 'derived' && source.op.type === 'mirror' && source.op.axis.kind === 'fold';
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
