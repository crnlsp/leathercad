import { EPS_LENGTH } from '@leathercad/core';
import {
  diagnose,
  problemKey,
  type Diagnostic,
  type ProblemCode,
  type Project,
  type Severity,
} from '@leathercad/domain';

/**
 * One diagnostic a scenario expects: what is said, how loudly, about what, and
 * the measurements that make it worth saying.
 *
 * `on` names the feature the problem is about, or `part:<id>` for a problem
 * with a whole piece (`EMPTY_PART`). `facts` is a subset: only the facts named
 * are compared, numbers within `EPS_LENGTH` unless given as `within(value,
 * tolerance)`, nested objects (a seam's sides) the same way.
 */
export interface Expected {
  readonly code: ProblemCode;
  readonly severity: Severity;
  readonly on: string;
  readonly related?: readonly string[];
  readonly facts?: Readonly<Record<string, unknown>>;
}

/** A number compared within a tolerance of the test's choosing, never looser than the code's. */
export interface Within {
  readonly within: true;
  readonly value: number;
  readonly tolerance: number;
}

export function within(value: number, tolerance: number): Within {
  if (!(tolerance >= EPS_LENGTH)) {
    throw new RangeError(
      `a tolerance below EPS_LENGTH claims more than the code does: ${tolerance}`,
    );
  }
  return { within: true, value, tolerance };
}

/** What kind of difference a line of the report describes. */
export type Finding =
  'missing' | 'unexpected' | 'severity' | 'target' | 'related' | 'facts' | 'duplicate';

export interface Difference {
  readonly finding: Finding;
  readonly line: string;
}

const targetOf = (d: Diagnostic): string =>
  d.featureId === undefined ? `part:${d.partId}` : d.featureId;

/**
 * Every way the actual list differs from the expected one, as the scenario's
 * reader needs it: what is missing, what appeared that should not, and for a
 * problem that is there, a wrong severity, subject, related feature or
 * measurement. Duplicates — the same problem listed twice on one subject — are
 * found whatever was expected.
 *
 * Pure, and tested on its own: a matcher that forgives is worse than none.
 */
export function differences(
  actual: readonly Diagnostic[],
  expected: readonly Expected[],
): Difference[] {
  const found: Difference[] = [];

  const seen = new Map<string, number>();
  for (const d of actual) {
    const key = `${problemKey(d.problem)} on ${targetOf(d)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) found.push({ finding: 'duplicate', line: `${key} — listed ${count} times` });
  }

  const unmatched = [...actual];
  const take = (d: Diagnostic) => unmatched.splice(unmatched.indexOf(d), 1);

  // Exact matches first, so a near miss is reported against the entry it
  // nearly matched and not against one that matches elsewhere.
  const pending: Expected[] = [];
  for (const e of expected) {
    const exact = unmatched.find((d) => problemsOf(d, e).length === 0);
    if (exact === undefined) pending.push(e);
    else take(exact);
  }

  for (const e of pending) {
    const sameTarget = unmatched.find((d) => d.problem.code === e.code && targetOf(d) === e.on);
    if (sameTarget !== undefined) {
      take(sameTarget);
      found.push(...problemsOf(sameTarget, e));
      continue;
    }
    const elsewhere = unmatched.find((d) => d.problem.code === e.code);
    if (elsewhere !== undefined) {
      take(elsewhere);
      found.push({
        finding: 'target',
        line: `${e.code} — expected on ${e.on}, found on ${targetOf(elsewhere)}`,
      });
      continue;
    }
    found.push({ finding: 'missing', line: `${e.code} (${e.severity}) on ${e.on}` });
  }

  for (const d of unmatched) {
    found.push({ finding: 'unexpected', line: describe(d) });
  }
  return found;
}

/** How one actual diagnostic differs from the entry it is meant to be. */
function problemsOf(d: Diagnostic, e: Expected): Difference[] {
  if (d.problem.code !== e.code || targetOf(d) !== e.on) {
    return [{ finding: 'target', line: `${e.code} on ${e.on}` }];
  }
  const found: Difference[] = [];
  const about = `${e.code} on ${e.on}`;
  if (d.severity !== e.severity) {
    found.push({
      finding: 'severity',
      line: `${about} — expected ${e.severity}, got ${d.severity}`,
    });
  }
  if (e.related !== undefined && !sameList(d.related, e.related)) {
    found.push({
      finding: 'related',
      line: `${about} — expected related [${e.related.join(', ')}], got [${d.related.join(', ')}]`,
    });
  }
  for (const mismatch of factMismatches(d.problem.facts, e.facts ?? {}, '')) {
    found.push({ finding: 'facts', line: `${about} — ${mismatch}` });
  }
  return found;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function factMismatches(actual: unknown, wanted: Readonly<Record<string, unknown>>, at: string) {
  const found: string[] = [];
  const facts = (actual ?? {}) as Readonly<Record<string, unknown>>;
  for (const [key, want] of Object.entries(wanted)) {
    const path = at === '' ? key : `${at}.${key}`;
    const got = facts[key];
    if (isWithin(want)) {
      if (typeof got !== 'number' || !(Math.abs(got - want.value) <= want.tolerance)) {
        found.push(`${path}: expected ${want.value} ± ${want.tolerance}, got ${show(got)}`);
      }
    } else if (typeof want === 'number') {
      if (typeof got !== 'number' || !(Math.abs(got - want) <= EPS_LENGTH)) {
        found.push(`${path}: expected ${want}, got ${show(got)}`);
      }
    } else if (want !== null && typeof want === 'object') {
      found.push(...factMismatches(got, want as Readonly<Record<string, unknown>>, path));
    } else if (got !== want) {
      found.push(`${path}: expected ${show(want)}, got ${show(got)}`);
    }
  }
  return found;
}

function isWithin(value: unknown): value is Within {
  return typeof value === 'object' && value !== null && (value as Within).within === true;
}

function show(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}

/** One diagnostic on one line: severity, code, subject and its facts. */
export function describe(d: Diagnostic): string {
  const related = d.related.length === 0 ? '' : ` related [${d.related.join(', ')}]`;
  return `${d.problem.code} (${d.severity}) on ${targetOf(d)}${related} ${JSON.stringify(d.problem.facts)}`;
}

function describeExpected(e: Expected): string {
  const related = e.related === undefined ? '' : ` related [${e.related.join(', ')}]`;
  const facts = e.facts === undefined ? '' : ` ${JSON.stringify(e.facts)}`;
  return `${e.code} (${e.severity}) on ${e.on}${related}${facts}`;
}

/**
 * The report a failing scenario prints: each difference, then both lists in
 * full, so the reader sees the whole state without a debugger.
 */
export function report(
  actual: readonly Diagnostic[],
  expected: readonly Expected[],
  when?: string,
): string | null {
  const found = differences(actual, expected);
  if (found.length === 0) return null;
  const width = Math.max(...found.map((f) => f.finding.length));
  return [
    `Smart Features: the diagnostics${when === undefined ? '' : ` ${when}`} are not what the scenario expects.`,
    ...found.map((f) => `  ${f.finding.padEnd(width)}  ${f.line}`),
    `Expected (${expected.length}):`,
    ...(expected.length === 0 ? ['  nothing'] : expected.map((e) => `  ${describeExpected(e)}`)),
    `Actual (${actual.length}):`,
    ...(actual.length === 0 ? ['  nothing'] : actual.map((d) => `  ${describe(d)}`)),
  ].join('\n');
}

/**
 * Asserts the project's **whole** diagnostic list — the one every surface
 * reads (X7) — is exactly `expected`: nothing missing, nothing extra, nothing
 * listed twice, each at its severity, on its subject, with its measurements.
 * An empty `expected` is the claim that nothing at all is said.
 */
export function expectDiagnostics(
  project: Project,
  expected: readonly Expected[],
  when?: string,
): void {
  const message = report(diagnose(project), expected, when);
  if (message !== null) throw new Error(message);
}
