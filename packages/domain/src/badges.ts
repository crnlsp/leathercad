import type { Diagnostic, Severity } from './problems/index.js';
import type { FeatureId, PartId } from './feature.js';

/**
 * What a badge shows: how many, and how bad the worst of them is.
 *
 * Counting is what a badge is for; ranking is what its colour is for. The badge
 * derives exactly one thing the `Diagnostic` did not already say — the worst of
 * a set — and that is a fold over `severity`, not a judgement. It never reads a
 * code to decide how to look.
 */
export interface Badge {
  readonly count: number;
  readonly worst: Severity;
}

export interface Badges {
  /** Everything in the project, or null when there is nothing wrong. */
  readonly project: Badge | null;
  /** Per part, counting its features' problems as well as its own. */
  readonly parts: ReadonlyMap<PartId, Badge>;
  /** Per feature, counting only diagnostics that name it. */
  readonly features: ReadonlyMap<FeatureId, Badge>;
}

const RANK: Readonly<Record<Severity, number>> = { info: 0, warning: 1, error: 2 };

/**
 * The worst of a set, or null for an empty one.
 *
 * The maximum rather than the commonest, which is the whole reason colour is
 * separate from count: nine infos and one error is an error.
 */
export function worstOf(severities: Iterable<Severity>): Severity | null {
  let worst: Severity | null = null;
  for (const severity of severities) {
    if (worst === null || RANK[severity] > RANK[worst]) worst = severity;
  }
  return worst;
}

/** Every badge in one pass over the one diagnostic list. */
export function badgesOf(diagnostics: readonly Diagnostic[]): Badges {
  const parts = new Map<PartId, Severity[]>();
  const features = new Map<FeatureId, Severity[]>();
  const all: Severity[] = [];

  for (const diagnostic of diagnostics) {
    all.push(diagnostic.severity);
    push(parts, diagnostic.partId, diagnostic.severity);
    if (diagnostic.featureId !== undefined) {
      push(features, diagnostic.featureId, diagnostic.severity);
    }
  }

  return {
    project: badge(all),
    parts: rolled(parts),
    features: rolled(features),
  };
}

function push<K>(into: Map<K, Severity[]>, key: K, severity: Severity): void {
  const found = into.get(key);
  if (found === undefined) into.set(key, [severity]);
  else found.push(severity);
}

/** A badge, or null where there is nothing to show — never a zero. */
function badge(severities: readonly Severity[]): Badge | null {
  const worst = worstOf(severities);
  return worst === null ? null : { count: severities.length, worst };
}

function rolled<K>(counted: Map<K, Severity[]>): ReadonlyMap<K, Badge> {
  const badges = new Map<K, Badge>();
  for (const [key, severities] of counted) {
    const made = badge(severities);
    if (made !== null) badges.set(key, made);
  }
  return badges;
}
