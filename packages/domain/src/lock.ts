import { eachFeature, type Feature, type FeatureId, type Project } from './feature.js';
import { problem, type Problem } from './problems/index.js';

/**
 * The lock, and what it actually protects (S7).
 *
 * `locked` used to be a **pick lock** and nothing else: `hitTest` and `snap`
 * skipped a locked feature and every command still edited and deleted it
 * (defect D8). That is worse than no lock, because the one thing it did was
 * take the feature away from the canvas — so a locked outline could not be
 * selected in order to be unlocked.
 *
 * Here the lock is enforced where changes happen, and the parts panel is the
 * way back: a locked feature is still selectable there, and still unlockable.
 *
 * **What the lock covers:** moving, transforming, reshaping, renaming,
 * re-parameterising, re-pointing a derivation, and deleting — directly, as
 * part of a part, or as the cascade behind someone else's delete.
 *
 * **What it does not:** visibility. S7 read strictly would cover hiding too,
 * but that is the wrong answer on a workbench — you lock the outline so you
 * cannot nudge it, and you still want to hide it to see what is underneath.
 * Lock protects the piece, not the view. See `domain-model.md` §8.2.
 */

/** The locked features among these ids, in document order. */
export function lockedAmong(project: Project, ids: Iterable<FeatureId>): Feature[] {
  const wanted = new Set(ids);
  const locked: Feature[] = [];
  for (const { feature } of eachFeature(project)) {
    if (feature.locked && wanted.has(feature.id)) locked.push(feature);
  }
  return locked;
}

/**
 * Why these features may not be changed, or `null`.
 *
 * Pure, and shared with the interface: a button is disabled by the same
 * question that refuses the command, so the two cannot disagree about what is
 * allowed (ADR 0013). It names the **first locked feature in document order**
 * rather than the first in the caller's list, so the message does not change
 * with the order of a selection.
 */
export function lockRefusal(project: Project, ids: Iterable<FeatureId>): Problem | null {
  const [first] = lockedAmong(project, ids);
  if (first === undefined) return null;

  return problem('FEATURE_LOCKED', { featureId: first.id, featureName: first.name });
}
