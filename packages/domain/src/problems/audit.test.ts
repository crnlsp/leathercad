import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INVARIANTS_WITHOUT_A_CODE, PROBLEM_CODES, type ProblemCategory } from './codes.js';
import type { ProblemCode } from './problem.js';

/**
 * The audit that keeps the catalogue, the code and the documentation from
 * drifting apart.
 *
 * It asserts **relationships**, never rules. "A hole within 1.5 mm of an edge
 * raises `HOLE_TOO_CLOSE_TO_EDGE`" is `validate.test.ts`'s job, and writing it
 * twice would mean changing it in two places, with the audit's copy the one
 * that quietly rots. What this asks instead is that a code exists, is
 * categorised consistently with the invariant it names, is written down in
 * docs/domain-model.md §8, and is exercised by some test that is not this one.
 *
 * Everything here is **static**: it reads the registry and the repository from
 * disk. No check depends on another test having run first, which is what makes
 * it a gate rather than a coincidence of ordering.
 */

const REPO = resolve(import.meta.dirname, '../../../..');
const DOMAIN_MODEL = join(REPO, 'docs/domain-model.md');
const MARKDOWN = readFileSync(DOMAIN_MODEL, 'utf8');

const codes = Object.keys(PROBLEM_CODES) as ProblemCode[];

/**
 * The two codes no test names, and why that is the honest answer rather than a
 * gap to be papered over with a test that proves nothing.
 *
 * Both are **unreachable today**. Reaching them would mean writing a fake that
 * throws, or a geometry result Tier 1 offsetting cannot produce — a test whose
 * only subject is the test's own scaffolding.
 */
const UNREACHABLE: { readonly [code: string]: string } = {
  OFFSET_SPLIT:
    'Tier 1 offsetting refuses a self-overlapping result rather than splitting it, so nothing produces a second piece yet. What has to be right on the day Tier 2 lands is the choice of piece, and keepLargestPiece is tested directly in offsetPieces.test.ts.',
  GEOMETRY_FAILED:
    'The fallback for a throw the domain has not classified. A test that reached it would be naming a check the domain should be making itself, so it would be a bug report, not coverage.',
};

/** Every `.test.ts` under `packages/`, so the scan cannot miss a new one. */
function testsUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...testsUnder(full));
    else if (entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const behaviourTests = testsUnder(join(REPO, 'packages')).filter(
  // The catalogue's own tests name every code by construction — `problems.test.ts`
  // has a sample of each, and this file has the registry. Counting either would
  // make the coverage check pass for a code nothing has ever produced.
  (path) => !/[\\/]problems[\\/](problems|audit)\.test\.ts$/.test(path),
);

const testText = behaviourTests.map(
  (path) => [relative(REPO, path), readFileSync(path, 'utf8')] as const,
);

/** The invariant ids §8's tables define. */
function documentedInvariants(): Set<string> {
  const ids = new Set<string>();
  for (const line of MARKDOWN.split('\n')) {
    const row = /^\|\s*(S|E|DR|X)(\d+)\s*\|/.exec(line);
    if (row !== null) ids.add(`${row[1]!}${row[2]!}`);
  }
  return ids;
}

/** §8.6's two catalogue tables, as `code → { category, protects }`. */
function documentedCodes(): Map<string, { category: string; protects: string }> {
  const rows = new Map<string, { category: string; protects: string }>();
  for (const line of MARKDOWN.split('\n')) {
    // Both tables put the code first and carry a category and an invariant;
    // the columns between them differ, so match on what they share.
    const row =
      /^\|\s*`([A-Z_]+)`\s*\|(?:[^|]*\|)?\s*(structural|interaction|outcome|rule)\s*\|\s*((?:S|E|DR|X)\d+)\s*\|/.exec(
        line,
      );
    if (row !== null) rows.set(row[1]!, { category: row[2]!, protects: row[3]! });
  }
  return rows;
}

describe('every invariant is accounted for', () => {
  it('documents every invariant a code names', () => {
    // The document is the source of truth for what an invariant *means*; a test
    // cannot read prose, so this checks only the link — an id the code uses has
    // to be an id §8 defines.
    const documented = documentedInvariants();
    const used = new Set(codes.map((code) => PROBLEM_CODES[code].protects));

    expect(documented.size).toBeGreaterThan(20);
    expect([...used].filter((id) => !documented.has(id)).sort()).toEqual([]);
  });

  it('gives every documented invariant either a code or a reason it needs none', () => {
    // The check that catches an invariant added to §8 and then forgotten. Some
    // are genuinely held up by something other than a check — a schema, a
    // layering rule, the absence of a field to store the violation in — so the
    // registry names them rather than leaving them silently uncovered.
    const accounted = new Set<string>([
      ...codes.map((code) => PROBLEM_CODES[code].protects),
      ...INVARIANTS_WITHOUT_A_CODE.map((e) => e.invariant),
    ]);

    expect([...documentedInvariants()].filter((id) => !accounted.has(id)).sort()).toEqual([]);
  });

  it('gives a reason, not a bare exemption', () => {
    for (const entry of INVARIANTS_WITHOUT_A_CODE) {
      expect(entry.because.length, entry.invariant).toBeGreaterThan(40);
    }
  });

  it('does not exempt an invariant that has a code after all', () => {
    // An invariant that gains a code should lose its exemption, or the
    // exemption outlives the reason for it and starts lying.
    const withCode = new Set(codes.map((code) => PROBLEM_CODES[code].protects));

    expect(INVARIANTS_WITHOUT_A_CODE.filter((e) => withCode.has(e.invariant))).toEqual([]);
  });
});

describe('the registry and §8.6 agree', () => {
  const documented = documentedCodes();

  it('reads both catalogue tables', () => {
    // A guard on the parse: if the tables moved or changed shape, every check
    // below would fail for the same wrong reason, and this says which.
    expect(documented.size).toBeGreaterThan(40);
  });

  it.each(codes)('%s is written down, with the same category and invariant', (code) => {
    const row = documented.get(code);
    const { category, protects } = PROBLEM_CODES[code];

    expect(row, `${code} is in the registry but in neither table in §8.6`).toBeDefined();
    expect(row).toEqual({ category, protects });
  });

  it('documents nothing as built that the registry does not have', () => {
    // The other direction: a row for a code that was renamed or never written.
    // A row may describe something planned — DR5's text rule is the standing
    // case — but then its last column says so rather than saying "built".
    const registered = new Set<string>(codes);
    const built = [...documented.keys()].filter((code) => {
      const line = MARKDOWN.split('\n').find((l) => l.startsWith(`| \`${code}\` |`))!;
      return /\|\s*built\b/.test(line);
    });

    expect(built.filter((code) => !registered.has(code)).sort()).toEqual([]);
  });

  it('splits the tables the way ADR 0013 does', () => {
    // Refusals in the refusal table, diagnostics in the diagnostics table —
    // checked through the category, which problems.test.ts already ties to the
    // invariant family. A diagnostic listed as a refusal would be a problem the
    // panel shows and the user can never resolve.
    const refused: ProblemCategory[] = ['structural', 'interaction'];
    const refusalTable = MARKDOWN.slice(
      MARKDOWN.indexOf('| Code | Category | Protects | Refused by |'),
      MARKDOWN.indexOf('The diagnostics themselves:'),
    );

    for (const code of codes) {
      const isRefusal = refused.includes(PROBLEM_CODES[code].category);
      expect(refusalTable.includes(`\`${code}\``), code).toBe(isRefusal);
    }
  });
});

describe('every code is exercised somewhere', () => {
  it.each(codes)('%s is named by a test of its own', (code) => {
    // Explicit coverage, read from the sources rather than registered at run
    // time: a code no test mentions is a code nothing holds to its meaning, and
    // this notices without depending on what ran before it.
    const mentions = testText.filter(([, text]) => text.includes(code));
    const reason = UNREACHABLE[code];

    if (reason !== undefined) {
      expect(reason.length).toBeGreaterThan(40);
      return;
    }
    expect(
      mentions.map(([path]) => path),
      `${code} is produced by nothing any test looks at`,
    ).not.toEqual([]);
  });

  it('scans a plausible number of test files', () => {
    expect(behaviourTests.length).toBeGreaterThan(30);
  });

  it('does not excuse a code that is reachable after all', () => {
    // The mirror of the invariant exemptions: once something tests it, the
    // excuse goes.
    const excusedButTested = Object.keys(UNREACHABLE).filter((code) =>
      testText.some(([, text]) => text.includes(code)),
    );

    expect(excusedButTested).toEqual([]);
  });
});
