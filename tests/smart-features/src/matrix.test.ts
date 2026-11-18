import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { PROBLEM_CODES, type ProblemCode } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { CLASSES, KNOWN_DEFECTS, MATRIX, inScope, isCovered } from './matrix.js';

/**
 * Holds the applicability matrix to the registry, to the scenarios and to its
 * documentation, both ways, as `problems/audit.test.ts` holds §8 of the domain
 * model. A rule added to the registry fails here until it has a row; a
 * scenario named in the matrix must exist; and a test that is allowed to fail
 * must be a defect someone wrote down.
 */

const SCENARIOS = resolve(import.meta.dirname, 'scenarios');
const DOC = resolve(import.meta.dirname, '../../../docs/smart-features.md');

const sources = readdirSync(SCENARIOS)
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => readFileSync(resolve(SCENARIOS, name), 'utf8'));

/** Every scenario's id as its test title starts — `it('SF-B2 · …'`, wrapped or not. */
function titled(pattern: RegExp): string[] {
  return sources.flatMap((source) => [...source.matchAll(pattern)].map((m) => m[1]!));
}
const scenarioIds = titled(/\bit(?:\.fails|\.each[^(]*\([^)]*\))?\(\s*'(SF-[A-Z]+\d+)\s/g);
const failingIds = titled(/\bit\.fails\(\s*'(SF-[A-Z]+\d+)\s/g);

const scope = (Object.keys(PROBLEM_CODES) as ProblemCode[]).filter((code) =>
  inScope(code, PROBLEM_CODES[code].category),
);

/** The codes of the table in the doc's §4, the prose half of the matrix. */
function documentedCodes(): string[] {
  const doc = readFileSync(DOC, 'utf8');
  const start = doc.indexOf('\n## 4.');
  const end = doc.indexOf('\n## ', start + 1);
  if (start < 0) throw new Error('docs/smart-features.md has no §4');
  return [...doc.slice(start, end).matchAll(/^\| `([A-Z_]+)` \|/gm)].map((m) => m[1]!);
}

describe('the Smart Features applicability matrix', () => {
  it('has a row for every design rule and declared-relationship outcome, and for nothing else', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...scope].sort());
  });

  it('documents every row in docs/smart-features.md §4, and nothing the matrix lacks', () => {
    expect(documentedCodes().sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it('fills every class of every row with scenarios, or says why not', () => {
    for (const [code, row] of Object.entries(MATRIX)) {
      for (const which of CLASSES) {
        const coverage = row[which];
        if (isCovered(coverage)) expect(coverage.length, `${code} ${which}`).toBeGreaterThan(0);
        else expect(Object.values(coverage)[0]?.trim(), `${code} ${which}`).not.toBe('');
      }
    }
  });

  it('names only scenarios that exist', () => {
    const named = Object.values(MATRIX).flatMap((row) =>
      CLASSES.flatMap((which) => {
        const coverage = row[which];
        return isCovered(coverage) ? coverage : [];
      }),
    );
    const missing = [...new Set(named)].filter((id) => !scenarioIds.includes(id));
    expect(missing).toEqual([]);
  });

  it('gives each scenario its own id', () => {
    const repeated = scenarioIds.filter((id, i) => scenarioIds.indexOf(id) !== i);
    expect(repeated).toEqual([]);
  });

  it('lets a scenario fail only as a known defect, written down in the doc', () => {
    expect([...failingIds].sort()).toEqual(KNOWN_DEFECTS.map((d) => d.scenario).sort());
    const doc = readFileSync(DOC, 'utf8');
    for (const { id, scenario } of KNOWN_DEFECTS) {
      expect(doc, `${id} is written down`).toContain(`**${id}**`);
      expect(doc, `${id} names its scenario`).toContain(scenario);
    }
  });
});

// The gaps, one todo each, so every run shows what is not yet covered.
describe('coverage still to write', () => {
  for (const [code, row] of Object.entries(MATRIX)) {
    for (const which of CLASSES) {
      const coverage = row[which];
      if ('gap' in coverage) it.todo(`${code} · ${which}: ${coverage.gap}`);
    }
  }
});
