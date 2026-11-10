import {
  derivationRefusal,
  evaluate,
  problem,
  type Derivation,
  type Feature,
  type Project,
} from '@leathercad/domain';

export function offsetRunAnchors(project: Project, feature: Feature): number[] {
  const source = feature.source;
  if (source.kind !== 'derived') return [];
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === source.sourceId);
  return entry?.ok === true
    ? entry.anchors.flatMap((distance, i) => (distance === null ? [] : [i]))
    : [];
}

export function offsetRunRefusal(
  project: Project,
  feature: Feature,
  op: Extract<Derivation, { type: 'offset' }>,
) {
  if (
    feature.kind === 'text-label' ||
    feature.kind === 'measurement' ||
    feature.source.kind !== 'derived'
  )
    return problem('NOT_DERIVED', { featureId: feature.id, featureName: feature.name });
  return derivationRefusal(project, { ...feature, source: { ...feature.source, op } });
}
