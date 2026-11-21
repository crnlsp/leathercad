import type { Diagnostic, Project } from '@leathercad/domain';
import { afterAll, beforeEach, expect } from 'vitest';

import { CLASSES, MATRIX, isCovered } from '../matrix.js';

/**
 * Makes the matrix's claims executable. Every state a scenario's bench is
 * checked in is recorded — the codes listed, and which rules' prerequisites
 * the project met — and when a scenario file ends, each scenario it ran is held
 * to what `matrix.ts` says it covers:
 *
 * - **positive** — some state lists the code;
 * - **negative** — some state meets the rule's prerequisites and lists no such code;
 * - **notApplicable** — some state does not meet them, and lists no such code;
 * - **transition** — on one bench, the code is listed in one state and not the next, or the reverse.
 *
 * So a scenario edited until it no longer exercises what the matrix says it
 * does fails, naming the claim. Universal rules have no prerequisite beyond
 * their geometry: their negative and not-applicable claims ask only for a
 * state without the code.
 */

interface State {
  readonly bench: number;
  readonly codes: ReadonlySet<string>;
  readonly met: ReadonlySet<string>;
}

/** What a rule needs the maker to have declared, as a question about the project. */
const PREREQUISITES: Readonly<Record<string, (project: Project) => boolean>> = {
  POCKET_TOO_NARROW: (p) => stitchLines(p).some((s) => s.holds !== undefined),
  POCKET_NOT_MEASURABLE: (p) => stitchLines(p).some((s) => s.holds !== undefined),
  POCKET_TOO_SHALLOW: (p) => stitchLines(p).some((s) => s.holds?.fully === true),
  SEAM_HOLE_COUNT_MISMATCH: (p) => (p.seams?.length ?? 0) > 0,
  SEAM_HOLES_DRIFT: (p) => (p.seams?.length ?? 0) > 0,
  SEAM_JOINS_ITSELF: (p) => (p.seams ?? []).some((s) => s.a.holeSetId === s.b.holeSetId),
  SEAM_SIDE_MISSING: (p) => (p.seams?.length ?? 0) > 0,
  SEAM_RUNS_OFF_THE_LINE: (p) => (p.seams?.length ?? 0) > 0,
};

function stitchLines(project: Project) {
  return project.parts
    .flatMap((part) => part.features)
    .flatMap((f) => (f.kind === 'stitch-line' ? [f] : []));
}

const states = new Map<string, State[]>();
const ran = new Set<string>();

function scenarioId(): string | null {
  return /\b(SF-[A-Z]+\d+)\b/.exec(expect.getState().currentTestName ?? '')?.[1] ?? null;
}

/** Called by the bench for every state a scenario looks at. */
export function record(bench: number, project: Project, diagnostics: readonly Diagnostic[]) {
  const id = scenarioId();
  if (id === null) return;
  const met = new Set(
    Object.entries(PREREQUISITES).flatMap(([code, holds]) => (holds(project) ? [code] : [])),
  );
  const list = states.get(id) ?? [];
  list.push({ bench, codes: new Set(diagnostics.map((d) => d.problem.code)), met });
  states.set(id, list);
}

/** What `matrix.ts` claims a scenario covers that its recorded states do not show. */
export function unmetClaims(id: string, seen: readonly State[]): string[] {
  const unmet: string[] = [];
  for (const [code, row] of Object.entries(MATRIX)) {
    const prerequisite = (s: State) => !(code in PREREQUISITES) || s.met.has(code);
    for (const which of CLASSES) {
      const coverage = row[which];
      if (!isCovered(coverage) || !coverage.includes(id)) continue;
      const shown =
        which === 'positive'
          ? seen.some((s) => s.codes.has(code))
          : which === 'negative'
            ? seen.some((s) => prerequisite(s) && !s.codes.has(code))
            : which === 'notApplicable'
              ? seen.some(
                  (s) => (!(code in PREREQUISITES) || !s.met.has(code)) && !s.codes.has(code),
                )
              : seen.some((s, i) => {
                  const next = seen[i + 1];
                  return next?.bench === s.bench && next.codes.has(code) !== s.codes.has(code);
                });
      if (!shown) unmet.push(`${id} claims ${which} for ${code}, and no state it checked shows it`);
    }
  }
  return unmet;
}

/**
 * Holds the scenarios of this file to their matrix claims, once they have all
 * run. Each scenario file calls it once, at the top.
 */
export function checkMatrixClaims(): void {
  beforeEach(() => {
    const id = scenarioId();
    if (id !== null) ran.add(id);
  });
  afterAll(() => {
    const unmet = [...ran].flatMap((id) => unmetClaims(id, states.get(id) ?? []));
    if (unmet.length > 0) throw new Error(`Smart Features matrix:\n  ${unmet.join('\n  ')}`);
  });
}
