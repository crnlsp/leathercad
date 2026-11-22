import { EPS_LENGTH, quantise, type Mm } from '@leathercad/core';
import { PathOps } from '@leathercad/geometry';

import { evaluate } from './evaluate.js';
import type { FeatureId, Project } from './feature.js';
import { distanceToEdge, isOnMaterial, materialOf } from './material.js';

/** A hole set's start and end offsets, as `stitch-holes` stores them. */
export interface EndOffsets {
  readonly startOffsetMm?: Mm;
  readonly endOffsetMm?: Mm;
}

/**
 * The start and end offsets that put a hole set's end holes as far in from the
 * edge as the stitch line is from the edges it follows (U2).
 *
 * A stitch line inset between two corners — a pocket *Open at the top* — runs
 * out to the edge it leaves open wherever a corner is square, so holes laid on
 * it from its very ends sit on the cut line. Moving each end hole in by what
 * the line's end lacks of its inset clears it by the same rule that clears
 * every other hole of its own edge; an end already that far in — a rounded
 * corner — needs nothing, and gets no offset.
 *
 * Empty when the line is not an inset stitch line run between corners, or
 * does not resolve: there is then no open edge to clear.
 */
export function endOffsetsClearOfTheEdge(project: Project, lineId: FeatureId): EndOffsets {
  for (const part of evaluate(project).parts) {
    const entry = part.features.find((f) => f.feature.id === lineId);
    if (entry === undefined) continue;
    const { feature } = entry;
    if (
      !entry.ok ||
      entry.path.closed ||
      feature.kind !== 'stitch-line' ||
      feature.source.kind !== 'derived' ||
      feature.source.op.type !== 'offset' ||
      feature.source.op.run.kind !== 'between'
    ) {
      return {};
    }
    const insetMm = feature.source.op.distanceMm;
    const material = materialOf(part);
    const lacking = (point: ReturnType<typeof PathOps.start>): Mm | undefined => {
      if (point === null) return undefined;
      const inMm = isOnMaterial(material, point) ? distanceToEdge(material, point) : 0;
      const short = insetMm - inMm;
      return short > EPS_LENGTH ? quantise(short) : undefined;
    };
    const startOffsetMm = lacking(PathOps.start(entry.path));
    const endOffsetMm = lacking(PathOps.end(entry.path));
    return {
      ...(startOffsetMm === undefined ? {} : { startOffsetMm }),
      ...(endOffsetMm === undefined ? {} : { endOffsetMm }),
    };
  }
  return {};
}
