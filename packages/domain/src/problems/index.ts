/**
 * The diagnostic channel: one model for everything that can be wrong.
 *
 * - **Identity** — `codes.ts`: every code, its category and the invariant it
 *   protects.
 * - **Information** — `problem.ts`: a problem is a code and facts; a diagnostic
 *   is a problem placed in the design.
 * - **Presentation** — `messages.ts`: the one catalogue of sentences.
 *
 * Surfaces live above the domain and read all three through here. See
 * docs/superpowers/specs/2026-09-15-diagnostic-channel-design.md.
 */

export type { CodeInfo, InvariantId, ProblemCategory } from './codes.js';
export { PROBLEM_CODES } from './codes.js';

export type {
  CompatibilityRule,
  Diagnostic,
  Problem,
  ProblemCode,
  ProblemFacts,
  ProblemLocation,
  Severity,
} from './problem.js';
export { problem, problemKey, sameProblem, subjectOf } from './problem.js';

export { describeProblem, describeProblemWithSubject, problemTitle } from './messages.js';
