import type { Feature, FeatureId, Project } from './feature.js';

/**
 * The reference graph: which feature depends on which, and what may depend on
 * what.
 *
 * Today every edge is a **derivation** — a stitch line built from an outline,
 * holes built from a stitch line. Slice 4.10 adds **references** (the ends of a
 * measurement) to the same functions. Whatever the kind, the invariants are
 * the same, and they are structural: commands refuse to break them, and the
 * loader refuses files that do (docs/domain-model.md §8.2, S1–S4).
 *
 * Everything here is pure and reads only parameters, never evaluated geometry.
 * A structural rule that depended on whether evaluation happened to succeed
 * would stop being structural.
 */

export type GraphProblemCode = 'DUPLICATE_ID' | 'MISSING_SOURCE' | 'CYCLE' | 'INCOMPATIBLE';

export interface GraphProblem {
  readonly featureId: FeatureId;
  readonly code: GraphProblemCode;
  /** Written for the person opening the file, naming the feature. */
  readonly message: string;
}

/**
 * Everything that transitively depends on `ids`, in document order — not
 * counting `ids` themselves.
 *
 * Deleting the outline and its stitch line together makes only the holes
 * collateral. A dialog asking about something the user named is noise.
 */
export function dependentsOf(project: Project, ids: Iterable<FeatureId>): FeatureId[] {
  const requested = new Set(ids);
  const reached = new Set(requested);
  const all = allFeatures(project);

  let grew = true;
  while (grew) {
    grew = false;
    for (const feature of all) {
      if (reached.has(feature.id)) continue;
      if (feature.source.kind === 'derived' && reached.has(feature.source.sourceId)) {
        reached.add(feature.id);
        grew = true;
      }
    }
  }

  const out: FeatureId[] = [];
  for (const feature of all) {
    if (reached.has(feature.id) && !requested.has(feature.id) && !out.includes(feature.id)) {
      out.push(feature.id);
    }
  }
  return out;
}

/**
 * Why this derived feature is not allowed as it stands, or `null`.
 *
 * Takes the feature itself rather than an id, so a command can ask about one
 * it is about to add. The order of the checks is the order a user can act on:
 * a missing source first, then a loop, then the compatibility table.
 */
export function derivationRefusal(project: Project, feature: Feature): string | null {
  if (feature.source.kind !== 'derived') return null;

  const byId = indexById(project);
  const source = byId.get(feature.source.sourceId);
  if (source === undefined) return 'The feature it follows does not exist.';
  if (source.id === feature.id) return `${feature.name} cannot follow itself.`;

  if (wouldLoop(byId, feature.id, source.id)) {
    return `${feature.name} would end up following itself, through ${source.name}.`;
  }

  return compatibilityRefusal(byId, feature, source);
}

/**
 * Why pointing `featureId` at `sourceId` would not be allowed, or `null`.
 *
 * Checks the feature, and then the whole project as it would be afterwards.
 * Re-pointing one feature can break another further down — a seam allowance
 * needs the stitch line it follows to stay closed — and a query that said yes
 * to that would leave the loader, not the command, to notice.
 */
export function followRefusal(
  project: Project,
  featureId: FeatureId,
  sourceId: FeatureId,
): string | null {
  const feature = indexById(project).get(featureId);
  if (feature === undefined) return 'That feature does not exist.';
  if (feature.source.kind !== 'derived') {
    return `${feature.name} does not follow anything, so there is nothing to re-point.`;
  }

  const candidate: Feature = { ...feature, source: { ...feature.source, sourceId } };
  const direct = derivationRefusal(project, candidate);
  if (direct !== null) return direct;

  const before = new Set(graphProblems(project).map(problemKey));
  const after = graphProblems(replaceFeature(project, candidate));
  const introduced = after.find((problem) => !before.has(problemKey(problem)));
  return introduced?.message ?? null;
}

/**
 * Every violation of S1–S4 in a project, each naming the feature.
 *
 * What the loader refuses. A sound project returns an empty list, and a
 * project the commands built is always sound.
 */
export function graphProblems(project: Project): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const all = allFeatures(project);

  const seen = new Set<FeatureId>();
  const reported = new Set<FeatureId>();
  for (const feature of all) {
    if (seen.has(feature.id) && !reported.has(feature.id)) {
      reported.add(feature.id);
      problems.push({
        featureId: feature.id,
        code: 'DUPLICATE_ID',
        message: `Two features share the id ${feature.id}.`,
      });
    }
    seen.add(feature.id);
  }

  const byId = indexById(project);
  for (const feature of all) {
    if (feature.source.kind !== 'derived') continue;

    const source = byId.get(feature.source.sourceId);
    if (source === undefined) {
      problems.push({
        featureId: feature.id,
        code: 'MISSING_SOURCE',
        message: `${feature.name} follows a feature that does not exist.`,
      });
      continue;
    }

    if (isOnCycle(byId, feature.id)) {
      problems.push({
        featureId: feature.id,
        code: 'CYCLE',
        message: `${feature.name} follows a chain that leads back to itself.`,
      });
      continue;
    }

    const refusal = compatibilityRefusal(byId, feature, source);
    if (refusal !== null) {
      problems.push({
        featureId: feature.id,
        code: 'INCOMPATIBLE',
        message: `${feature.name}: ${refusal}`,
      });
    }
  }

  return problems;
}

/**
 * The derivation compatibility table — docs/domain-model.md §4.2.
 *
 * The only derivations a command creates and the loader accepts. The mirror
 * row arrives with its op, in slice 4.8.
 */
function compatibilityRefusal(
  byId: ReadonlyMap<FeatureId, Feature>,
  target: Feature,
  source: Feature,
): string | null {
  if (target.source.kind !== 'derived') return null;
  const op = target.source.op;

  switch (op.type) {
    case 'stitch-holes':
      if (target.kind !== 'stitch-hole-set') {
        return 'Only a stitch hole set can follow a stitch line at a pitch.';
      }
      if (source.kind !== 'stitch-line') return 'Holes can only follow a stitch line.';
      return null;

    case 'offset':
      if (op.side === 'inward') {
        if (target.kind !== 'stitch-line')
          return 'Only a stitch line can be inset from an outline.';
        if (source.kind !== 'cut-contour') {
          return 'A stitch line can only be inset from an outline or a cut-out.';
        }
        return null;
      }

      // Outward: seam allowance, an outline derived from its stitch line.
      if (target.kind !== 'cut-contour') {
        return 'Only an outline can be offset outward from a stitch line.';
      }
      if (source.kind !== 'stitch-line') {
        return 'An outline can only be offset outward from a stitch line.';
      }
      if (target.role !== 'outer') {
        return "Only a part's outer outline can be derived from its stitch line, not a cut-out.";
      }
      if (op.run.kind !== 'whole') {
        return 'A seam allowance follows the whole stitch line, so the outline it makes is closed.';
      }
      if (!declaresClosed(byId, source, new Set())) {
        return 'A seam allowance needs a closed stitch line: an outline has to enclose the part.';
      }
      return null;
  }
}

/**
 * Whether a feature is closed by its parameters alone.
 *
 * A shape that encloses an area, a closed drawn path, or a whole-run offset of
 * something closed. Read from parameters on purpose: see the module comment.
 */
function declaresClosed(
  byId: ReadonlyMap<FeatureId, Feature>,
  feature: Feature,
  visiting: Set<FeatureId>,
): boolean {
  const source = feature.source;
  switch (source.kind) {
    case 'path':
      return source.path.closed;
    case 'shape':
      return source.shape.type === 'rect' || source.shape.type === 'circle';
    case 'derived': {
      if (visiting.has(feature.id)) return false;
      if (source.op.type !== 'offset' || source.op.run.kind !== 'whole') return false;
      const from = byId.get(source.sourceId);
      if (from === undefined) return false;
      visiting.add(feature.id);
      return declaresClosed(byId, from, visiting);
    }
  }
}

/** Whether following sources upstream from `startId` reaches `featureId`. */
function wouldLoop(
  byId: ReadonlyMap<FeatureId, Feature>,
  featureId: FeatureId,
  startId: FeatureId,
): boolean {
  const seen = new Set<FeatureId>();
  let at: FeatureId | undefined = startId;
  while (at !== undefined) {
    if (at === featureId) return true;
    if (seen.has(at)) return false;
    seen.add(at);
    const source: Feature['source'] | undefined = byId.get(at)?.source;
    at = source?.kind === 'derived' ? source.sourceId : undefined;
  }
  return false;
}

function isOnCycle(byId: ReadonlyMap<FeatureId, Feature>, id: FeatureId): boolean {
  const source = byId.get(id)?.source;
  return source?.kind === 'derived' && wouldLoop(byId, id, source.sourceId);
}

function allFeatures(project: Project): Feature[] {
  return project.parts.flatMap((part) => part.features);
}

/** First occurrence wins; a duplicated id is reported on its own. */
function indexById(project: Project): Map<FeatureId, Feature> {
  const byId = new Map<FeatureId, Feature>();
  for (const feature of allFeatures(project)) {
    if (!byId.has(feature.id)) byId.set(feature.id, feature);
  }
  return byId;
}

function replaceFeature(project: Project, replacement: Feature): Project {
  return {
    ...project,
    parts: project.parts.map((part) => ({
      ...part,
      features: part.features.map((f) => (f.id === replacement.id ? replacement : f)),
    })),
  };
}

function problemKey(problem: GraphProblem): string {
  return `${problem.code}:${problem.featureId}`;
}
