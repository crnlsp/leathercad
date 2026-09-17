import type { Feature, FeatureId, Part } from './feature.js';

/**
 * A feature and the features that follow it, within one part.
 *
 * The shape the parts panel draws — *Outline ▸ Stitch line ▸ Holes*. This is
 * where the reference graph becomes visible, and a user who can see that the
 * holes hang off the stitch line is not surprised when deleting the stitch
 * line offers to take them with it (ADR 0009).
 */
export interface FeatureNode {
  readonly feature: Feature;
  readonly children: readonly FeatureNode[];
}

/**
 * The features of one part, nested under what they follow.
 *
 * Three rules, and the third is the one worth stating:
 *
 * 1. A derived feature is a **child** of its source, when the source is in
 *    this part.
 * 2. Everything else is a **root**, in document order — drawn geometry, and
 *    anything following a feature in another part, which has nothing here to
 *    nest under and must not simply vanish from the panel.
 * 3. A feature on a **cycle** is a root too. S3 refuses cycles at the command
 *    and at the loader, so this is unreachable from anything this application
 *    wrote — but a panel that hangs is worse than one that lies, and "draw it
 *    flat" is a better failure than a stack overflow while the user watches.
 *
 * Every feature appears exactly once, whatever the sources say.
 */
export function featureTree(part: Part): readonly FeatureNode[] {
  const byId = new Map<FeatureId, Feature>(part.features.map((feature) => [feature.id, feature]));

  /** The feature this one nests under, or null when it nests under nothing. */
  const parentOf = (feature: Feature): FeatureId | null => {
    if (feature.source.kind !== 'derived') return null;
    const sourceId = feature.source.sourceId;
    // Its own source, or a source in another part: either way, not here.
    return sourceId !== feature.id && byId.has(sourceId) ? sourceId : null;
  };

  /** Whether following sources from here comes back to where it started. */
  const onCycle = (feature: Feature): boolean => {
    const seen = new Set<FeatureId>([feature.id]);
    let at = parentOf(feature);
    while (at !== null) {
      if (seen.has(at)) return true;
      seen.add(at);
      at = parentOf(byId.get(at)!);
    }
    return false;
  };

  const children = new Map<FeatureId, Feature[]>();
  const roots: Feature[] = [];

  for (const feature of part.features) {
    const parent = onCycle(feature) ? null : parentOf(feature);
    if (parent === null) {
      roots.push(feature);
      continue;
    }
    const siblings = children.get(parent);
    if (siblings === undefined) children.set(parent, [feature]);
    else siblings.push(feature);
  }

  const build = (feature: Feature): FeatureNode => ({
    feature,
    children: (children.get(feature.id) ?? []).map(build),
  });

  return roots.map(build);
}
