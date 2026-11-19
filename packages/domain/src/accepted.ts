import { approxEq, QUANTUM_MM } from '@leathercad/core';

import {
  findFeature,
  type AcceptedWarning,
  type Cause,
  type Feature,
  type Part,
  type Project,
} from './feature.js';
import { problemKey, subjectOf, type Diagnostic, type Problem } from './problems/index.js';

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
 * - **Anything else**: the stored parameters it was found from — the source
 *   of the feature it names and of each feature that one follows, and the
 *   piece's cut outlines. Never a measured fact (invariant 4: nothing computed
 *   is stored), and never a name, so a rename is not a new problem.
 *
 * Stored values are kept as they are; where the piece sits is left out by
 * comparing coordinates up to one translation, so moving the piece keeps an
 * acceptance while a changed inset or a reshaped outline brings it back.
 * Numbers compare to the storage quantum.
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
      return inputsOf(project, p);
  }
}

/** The stored sources a problem was found from: its subject's chain, then the piece's cut outlines. */
function inputsOf(project: Project, p: Problem): Cause {
  const subject = subjectOf(p);
  const owner: Part | undefined =
    subject.featureId !== undefined
      ? findFeature(project, subject.featureId)?.part
      : project.parts.find((part) => part.id === subject.partId);
  if (owner === undefined) return null;
  const byId = new Map(owner.features.map((f) => [f.id, f] as const));
  const inputs: Feature[] = [];
  const add = (f: Feature | undefined) => {
    if (f !== undefined && !inputs.includes(f)) inputs.push(f);
  };
  // The subject and what it follows: a hole set, its stitch line, its outline.
  for (
    let f = subject.featureId === undefined ? undefined : byId.get(subject.featureId);
    f !== undefined && !inputs.includes(f);
    f = f.source.kind === 'derived' ? byId.get(f.source.sourceId) : undefined
  ) {
    add(f);
  }
  for (const f of owner.features) if (f.kind === 'cut-contour') add(f);
  return inputs.map((f) => ({ id: f.id, kind: f.kind, source: asCause(f.source) }));
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
 * Whether two causes are the same, up to one translation of every point in
 * them. Numbers within the storage quantum: no stored parameter differs by less.
 */
function sameCause(a: Cause, b: Cause): boolean {
  return sameWithin(a, b, { shift: null });
}

/** A point as the model stores one: exactly `x` and `y`. */
function isPoint(c: Cause): c is { readonly x: number; readonly y: number } {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return false;
  const keys = Object.keys(c);
  return (
    keys.length === 2 &&
    typeof (c as { readonly x?: Cause }).x === 'number' &&
    typeof (c as { readonly y?: Cause }).y === 'number'
  );
}

function sameWithin(
  a: Cause,
  b: Cause,
  translation: { shift: { readonly x: number; readonly y: number } | null },
): boolean {
  if (isPoint(a) && isPoint(b)) {
    // The first point pair fixes the translation; every other must agree.
    const shift = (translation.shift ??= { x: b.x - a.x, y: b.y - a.y });
    return approxEq(a.x + shift.x, b.x, QUANTUM_MM) && approxEq(a.y + shift.y, b.y, QUANTUM_MM);
  }
  if (typeof a === 'number' && typeof b === 'number') return approxEq(a, b, QUANTUM_MM);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const right: readonly Cause[] = b;
    return a.every((item: Cause, i) => sameWithin(item, right[i] ?? null, translation));
  }
  const left = a as { readonly [key: string]: Cause };
  const right = b as { readonly [key: string]: Cause };
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => key in right && sameWithin(left[key] ?? null, right[key] ?? null, translation),
    )
  );
}
