import { approxEq, QUANTUM_MM } from '@leathercad/core';

import { findFeature, type AcceptedWarning, type Cause, type Project } from './feature.js';
import { problemKey, type Diagnostic, type Problem } from './problems/index.js';

/**
 * Accepting a warning (9.16): the maker has weighed it, and it stays quiet
 * until what it was found from changes.
 *
 * The key alone is not enough (Smart Features W4, SF-H6): a pocket asked to
 * hold a passport instead of a card keeps its key. So an acceptance stores the
 * warning's cause beside its key, and a warning is accepted only while both
 * still match:
 *
 * - **DR8** (a pocket): the requirement, ease included. Not the measured width
 *   or depth — reshaping the pocket is the maker's answer to the warning, not
 *   a new one.
 * - **DR7** (a seam): each side's hole set, its iron's pitch and its stretch.
 * - **Anything else**: the problem's facts, less the names (a rename is not a
 *   new problem), measurements compared to the storage quantum, so float noise
 *   from an unrelated edit or a save's six decimals never re-raises it.
 */

/** What to store to accept `diagnostic` in `project`. Only a warning can be accepted. */
export function acceptance(project: Project, diagnostic: Diagnostic): AcceptedWarning {
  if (diagnostic.severity !== 'warning') {
    throw new RangeError(`only a warning can be accepted, not ${diagnostic.severity}`);
  }
  return {
    problemKey: problemKey(diagnostic.problem),
    cause: causeOf(project, diagnostic.problem),
  };
}

/** `diagnostics`, each warning whose stored acceptance still matches marked `accepted`. */
export function markAccepted(
  project: Project,
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  const stored = project.acceptedWarnings ?? [];
  if (stored.length === 0) return diagnostics;
  return diagnostics.map((d) => {
    if (d.severity !== 'warning') return d;
    const key = problemKey(d.problem);
    const entries = stored.filter((entry) => entry.problemKey === key);
    if (entries.length === 0) return d;
    const cause = causeOf(project, d.problem);
    return entries.some((entry) => sameCause(entry.cause, cause)) ? { ...d, accepted: true } : d;
  });
}

function causeOf(project: Project, p: Problem): Cause {
  switch (p.code) {
    case 'POCKET_TOO_NARROW':
    case 'POCKET_TOO_SHALLOW':
    case 'POCKET_NOT_MEASURABLE': {
      const found = findFeature(project, p.facts.featureId)?.feature;
      return found?.kind === 'stitch-line' ? asCause(found.holds) : null;
    }
    case 'SEAM_HOLES_DRIFT': {
      const seam = project.seams?.find((s) => s.id === p.facts.seamId);
      if (seam === undefined) return null;
      return [seam.a, seam.b].map((side) => {
        const source = findFeature(project, side.holeSetId)?.feature.source;
        const pitchMm =
          source?.kind === 'derived' && source.op.type === 'stitch-holes'
            ? source.op.pitchMm
            : null;
        return { holeSetId: side.holeSetId, pitchMm, stretch: asCause(side.stretch) };
      });
    }
    default:
      return asCause(
        Object.fromEntries(Object.entries(p.facts).filter(([key]) => !key.endsWith('Name'))),
      );
  }
}

/** A plain copy of `value` as JSON would hold it; absent fields left out. */
function asCause(value: unknown): Cause {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(asCause);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, inner]) => inner !== undefined)
        .map(([key, inner]) => [key, asCause(inner)]),
    );
  }
  return null;
}

/**
 * Whether two causes are the same. Numbers within the storage quantum: no
 * stored parameter differs by less, and a measurement that moved by less has
 * not changed in any way a maker could cut.
 */
function sameCause(a: Cause, b: Cause): boolean {
  if (typeof a === 'number' && typeof b === 'number') return approxEq(a, b, QUANTUM_MM);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const right: readonly Cause[] = b;
    return a.every((item: Cause, i) => sameCause(item, right[i] ?? null));
  }
  const left = a as { readonly [key: string]: Cause };
  const right = b as { readonly [key: string]: Cause };
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && sameCause(left[key] ?? null, right[key] ?? null))
  );
}
