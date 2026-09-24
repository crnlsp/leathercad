import { formatEditable, type Mm, type Ulid } from '@leathercad/core';
import type {
  Derivation,
  Feature,
  FeatureId,
  FeatureKind,
  FoldLine,
  HardwareHole,
  MarkingLine,
  ParametricShape,
  GeometrySource,
  Part,
  PartId,
  MeasureKind,
  MeasureRef,
  MirrorAxis,
  Orientation,
  PaperName,
  Problem,
  Project,
  Run,
} from '@leathercad/domain';
import {
  DEFAULT_SETTINGS,
  additionRefusal,
  dependentsOf,
  derivationRefusal,
  evaluate,
  findFeature,
  followRefusal,
  lockRefusal,
  problem,
  transformShape,
  transformTextSource,
} from '@leathercad/domain';
import {
  MatOps,
  PathOps,
  RectOps,
  Shapes,
  decomposeGlide,
  glideMatrix,
  type Mat2x3,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

import { command, type Command, type Document } from './document.js';

export function emptyProject(id: Ulid, name = 'Untitled'): Project {
  return { id, name, settings: DEFAULT_SETTINGS, parts: [] };
}

export function emptyDocument(id: Ulid, name?: string): Document {
  return { project: emptyProject(id, name) };
}

/** Adds a part, optionally with its features already in place. */
export function addPart(part: Part): Command {
  return command(`Add ${part.name}`, (document) => ({
    project: { ...document.project, parts: [...document.project.parts, part] },
  }));
}

/**
 * Adds a feature to a part.
 *
 * A derived feature the reference graph would not allow — a missing source, a
 * loop, a pairing the compatibility table forbids — is refused and the document
 * left exactly as it was (S2–S4). The UI asks `derivationRefusal` for the reason.
 */
export function addFeature(partId: PartId, feature: Feature): Command {
  return command(`Add ${feature.name}`, (document) => {
    if (derivationRefusal(document.project, feature) !== null) return document;
    // S5 and S6: one outline per part, and an outline that encloses something.
    // The UI asks `additionRefusal` for the reason.
    if (additionRefusal(document.project, partId, feature) !== null) return document;
    return {
      project: mapPart(document.project, partId, (part) => ({
        ...part,
        features: [...part.features, feature],
      })),
    };
  });
}

/**
 * Deletes features — never a feature the user did not name without being told
 * what to do with it (ADR 0009).
 *
 * With nothing depending on `ids`, it deletes. With dependents and no
 * `resolution`, it **refuses**, returning the document unchanged so the store
 * records nothing; the dialog reads `planDelete` and asks. `'delete-dependents'`
 * takes the whole chain; `'freeze-dependents'` keeps each direct dependent as
 * drawn geometry, deleting only what has no drawn form.
 *
 * Parts are never removed here, however empty they become: a part carries a
 * name and a quantity the user gave it, and goes only through `deletePart`.
 */
export function deleteFeatures(ids: Iterable<FeatureId>, resolution?: DeleteResolution): Command {
  const requested = [...new Set(ids)];

  return {
    label: requested.length === 1 ? 'Delete feature' : `Delete ${requested.length} features`,
    labelFor: (document) => deleteLabel(document.project, requested, resolution),
    apply: (document) => {
      if (requested.length === 0) return document;
      const outcome = resolveDelete(document.project, requested, resolution);
      if (outcome === null || outcome.gone.size === 0) return document;
      return { project: applyOutcome(document.project, outcome) };
    },
  };
}

export function renameFeature(id: FeatureId, name: string): Command {
  return command('Rename', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, name })),
  }));
}

/**
 * Shows or hides a feature.
 *
 * Allowed on a locked feature on purpose: the lock protects the piece, not the
 * view. You pin the outline down so you cannot nudge it, and you still want to
 * hide it to see what is underneath. See `domain/lock.ts`.
 */
export function setFeatureVisible(id: FeatureId, visible: boolean): Command {
  return command(visible ? 'Show feature' : 'Hide feature', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, visible }), {
      evenIfLocked: true,
    }),
  }));
}

/**
 * Pins a feature down, or lets it go (S7).
 *
 * The one command that may change a locked feature, because it is the only way
 * back: `hitTest` and `snap` already skip a locked feature, so without this —
 * and without the parts panel it is reached from — locking an outline would
 * put it permanently out of reach (defect D8).
 */
export function setFeatureLocked(id: FeatureId, locked: boolean): Command {
  return command(locked ? 'Lock' : 'Unlock', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, locked }), {
      evenIfLocked: true,
    }),
  }));
}

/** Replaces a parametric shape — the path is regenerated on evaluation. */
export function setShape(id: FeatureId, shape: ParametricShape): Command {
  return command('Edit shape', (document) => ({
    project: mapFeature(document.project, id, (feature) => {
      // A label is made of words; it has no shape to replace, and asking for
      // one is a no-op rather than a way to turn it into a rectangle.
      if (feature.kind === 'text-label') return feature;
      // Nor a dimension: it has no shape, it reads one.
      if (feature.kind === 'measurement') return feature;
      // Nor does a **derived** feature have a shape of its own. Replacing its
      // source here would silently detach it from what it follows — a stitch
      // line that stopped following its outline, a counterpart that stopped
      // mirroring — which is exactly what X3 forbids. The panel offers no
      // shape fields for one; this is the guarantee underneath that.
      if (feature.source.kind === 'derived') return feature;
      // Changed, not rebuilt: a shape source keeps whatever else it carries —
      // a newer build's unknown fields among them (file-format.md §4.3).
      return {
        ...feature,
        source:
          feature.source.kind === 'shape' ? { ...feature.source, shape } : { kind: 'shape', shape },
      };
    }),
  }));
}

/**
 * Moves features by a millimetre delta.
 *
 * The translation case of `transformFeatures`, kept because moving is the
 * common thing and a matrix is a poor way to ask for it.
 */
export function translateFeatures(ids: Iterable<FeatureId>, deltaMm: Vec2): Command {
  return transformFeatures(ids, MatOps.fromTranslation(deltaMm), 'Move');
}

/**
 * Applies a transform to features.
 *
 * A parametric shape transforms **through its parameters** so it stays
 * parametric — a rectangle stays a rectangle you can retype the width of. A
 * drawn path has its points transformed, since it has no parameters to protect.
 *
 * A shape whose representation cannot survive the transform — a circle under a
 * non-uniform scale, which would become an ellipse — is **left exactly as it
 * was**, and the rest of the selection still moves. Nothing is silently demoted
 * to another representation; see `transformShape` for the rule. Ask
 * `refusedTransforms` first if you need to tell the user why.
 */
export function transformFeatures(
  ids: Iterable<FeatureId>,
  matrix: Mat2x3,
  label = 'Transform',
): Command {
  const targets = new Set(ids);

  return command(label, (document) => {
    if (targets.size === 0) return document;
    // A mixed selection is refused whole (S7). Moving the free half would
    // leave the drawing somewhere the user did not ask for and cannot see at
    // a glance — worse than not moving at all.
    if (lockRefusal(document.project, targets) !== null) return document;

    const next = {
      project: {
        ...document.project,
        parts: document.project.parts.map((part) => ({
          ...part,
          features: part.features.map((feature) =>
            targets.has(feature.id)
              ? transformFeature(
                  feature,
                  matrix,
                  feature.kind !== 'text-label' &&
                    feature.source.kind === 'derived' &&
                    targets.has(feature.source.sourceId),
                )
              : feature,
          ),
        })),
      },
    };

    // Everything refused is everything unchanged, and a no-op earns no
    // history: "Undo Move" with nothing behind it is worse than no entry.
    return movedAnything(document.project, next.project) ? next : document;
  });
}

/**
 * Which way a flip mirrors.
 *
 * Named for what the user sees happen, as every drawing tool names it:
 * `horizontal` swaps left and right, across a vertical axis.
 */
export type FlipAxis = 'horizontal' | 'vertical';

/**
 * Mirrors the selection about its own centre.
 *
 * About the centre rather than a chosen axis, because that is the flip a
 * person means when they flip one piece: it stays where it is and faces the
 * other way. Mirroring a feature *to* somewhere — a linked counterpart across
 * a fold — is a derivation, and that is slice 4.8 (ADR 0012), not this.
 *
 * Nothing moves if the selection has no geometry to measure, and whatever
 * cannot survive a mirror refuses through the usual path: a derived feature
 * follows its source, and a label would read backwards.
 */
export function flipFeatures(ids: Iterable<FeatureId>, axis: FlipAxis): Command {
  const targets = [...new Set(ids)];

  return {
    label: axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
    apply: (document) => {
      const centre = centreOf(document.project, targets);
      if (centre === null) return document;

      const next = transformFeatures(targets, mirrorAbout(centre, axis)).apply(document);

      // A flip everything refused is a no-op, and a no-op earns no history:
      // "Flip horizontal" in the undo menu with nothing behind it is worse
      // than no entry at all.
      return movedAnything(document.project, next.project) ? next : document;
    },
  };
}

/**
 * Why flipping this selection would refuse, or `null`.
 *
 * The same check the command makes, asked first — the pattern every refusal
 * here follows (X1). The panel disables its Flip buttons with this and shows
 * the reason, rather than offering a gesture that quietly does nothing.
 */
export function flipRefusal(
  project: Project,
  ids: Iterable<FeatureId>,
  axis: FlipAxis,
): Problem | null {
  const targets = [...new Set(ids)];

  // The lock first: it refuses the whole selection, so it is the reason, not
  // one of several. Without it the button stays enabled on a locked piece and
  // pressing it does nothing (S7, X1).
  const locked = lockRefusal(project, targets);
  if (locked !== null) return locked;

  const centre = centreOf(project, targets);
  if (centre === null) return null;

  return refusedTransforms(project, targets, mirrorAbout(centre, axis))[0]?.problem ?? null;
}

/** Whether any feature actually changed — by identity, so it is exact. */
function movedAnything(before: Project, after: Project): boolean {
  const was = new Map<FeatureId, Feature>();
  for (const part of before.parts) {
    for (const feature of part.features) was.set(feature.id, feature);
  }

  for (const part of after.parts) {
    for (const feature of part.features) {
      if (was.get(feature.id) !== feature) return true;
    }
  }
  return false;
}

/** A reflection about a line through `centre`, along one of the axes. */
function mirrorAbout(centre: Vec2, axis: FlipAxis): Mat2x3 {
  return MatOps.composeAll(
    MatOps.fromTranslation({ x: -centre.x, y: -centre.y }),
    axis === 'horizontal' ? MatOps.fromScale(-1, 1) : MatOps.fromScale(1, -1),
    MatOps.fromTranslation(centre),
  );
}

/** The centre of everything named that actually resolved to geometry. */
function centreOf(project: Project, ids: readonly FeatureId[]): Vec2 | null {
  const wanted = new Set(ids);
  const boxes = [];

  for (const part of evaluate(project).parts) {
    for (const entry of part.features) {
      if (!entry.ok || !wanted.has(entry.feature.id)) continue;
      const box = PathOps.bbox(entry.path);
      if (box !== null) boxes.push(box);
    }
  }

  const bounds = RectOps.unionAll(boxes);
  return bounds === null ? null : RectOps.centre(bounds);
}

/** A feature that would refuse the transform, and the problem that refuses it. */
export interface RefusedTransform {
  readonly featureId: FeatureId;
  readonly problem: Problem;
}

/**
 * Which features would refuse `matrix`, and why — without applying anything.
 *
 * The tool asks this to decide whether to explain itself; the command uses the
 * same `transformShape` underneath, so the answer cannot disagree with what
 * actually happens.
 */
export function refusedTransforms(
  project: Project,
  ids: Iterable<FeatureId>,
  matrix: Mat2x3,
): RefusedTransform[] {
  const targets = new Set(ids);
  const refused: RefusedTransform[] = [];

  const byId = new Map(
    project.parts.flatMap((part) => part.features).map((f) => [f.id, f] as const),
  );

  for (const part of project.parts) {
    for (const feature of part.features) {
      if (!targets.has(feature.id)) continue;

      if (feature.kind !== 'text-label' && feature.source.kind === 'derived') {
        // A mirror has a placement of its own, so it moves, turns and flips.
        // The one thing it cannot do is change size: a counterpart is the size
        // of its original, and a reflection-and-slide has nowhere to put a
        // scale. One question answers it — is this a distance-preserving
        // transform — which covers shears as well, for the same reason.
        if (feature.source.op.type === 'mirror') {
          // A **fold-tracked** counterpart is placed by its fold, so no
          // gesture on it is absorbed. The general rule this is the first
          // instance of: dragging a derived, linked result must not silently
          // break or half-alter the relationship. Absorbing it would slide one
          // half of a folded piece along the spine; detaching from the fold
          // would break the link the maker asked for (X3). So it is refused,
          // and the message names the two things that do move it.
          if (feature.source.op.axis.kind === 'fold') {
            const foldId = feature.source.op.axis.foldId;
            // Dragged *with* its source or its fold, it is not being asked to
            // go anywhere of its own: the source moves and it re-mirrors, or
            // the fold moves and it follows. Only a counterpart dragged on its
            // own has been asked for something the fold decides.
            if (targets.has(feature.source.sourceId) || targets.has(foldId)) continue;

            const fold = byId.get(foldId);
            refused.push({
              featureId: feature.id,
              problem: problem('MIRROR_PLACED_BY_FOLD', {
                featureId: feature.id,
                featureName: feature.name,
                foldName: fold?.name ?? 'its fold',
                sourceName: byId.get(feature.source.sourceId)?.name ?? 'its original',
              }),
            });
            continue;
          }

          // Scaled **with its original** is not a refusal: the original takes
          // the scale and the counterpart follows it, which is what selecting
          // a whole symmetric panel and resizing it has to do. Only a
          // counterpart scaled on its own has nowhere to put the change.
          if (!MatOps.isIsometry(matrix) && !movesWithItsSource(byId, feature, targets)) {
            refused.push({
              featureId: feature.id,
              problem: problem('MIRROR_WOULD_SCALE', {
                featureId: feature.id,
                featureName: feature.name,
                sourceName: byId.get(feature.source.sourceId)?.name ?? 'its original',
              }),
            });
          }
          continue;
        }

        // Any other derived feature has no geometry of its own to move. Moved
        // with what it follows, it follows; moved alone, nothing happens — and
        // the user is told why rather than left watching it not move (X3).
        if (!movesWithItsSource(byId, feature, targets)) {
          const root = rootOf(byId, feature);
          refused.push({
            featureId: feature.id,
            problem: problem('DERIVED_MOVED_ALONE', {
              featureId: feature.id,
              featureName: feature.name,
              rootId: root.id,
              rootName: root.name,
            }),
          });
        }
        continue;
      }

      if (feature.kind === 'text-label') {
        const turned = transformTextSource(feature.source, matrix);
        if (!turned.ok) refused.push({ featureId: feature.id, problem: turned.error });
        continue;
      }

      if (feature.source.kind !== 'shape') continue;

      const result = transformShape(feature.source.shape, matrix);
      if (!result.ok) {
        refused.push({ featureId: feature.id, problem: result.error });
      }
    }
  }

  return refused;
}

function transformFeature(feature: Feature, matrix: Mat2x3, withSource = false): Feature {
  // A label transforms through its parameters, exactly as a parametric shape
  // does: it stays a label you can retype, rather than becoming outlines.
  if (feature.kind === 'text-label') {
    const turned = transformTextSource(feature.source, matrix);
    return turned.ok ? { ...feature, source: turned.value } : feature;
  }

  // A dimension has no geometry of its own to move: it is a reading of the
  // places it names, and it re-reads them wherever they end up. Moving one
  // alone is not a refusal — there is simply nothing to move.
  if (feature.kind === 'measurement') return feature;

  if (feature.source.kind === 'path') {
    return {
      ...feature,
      // The source is kept and its path replaced: a moved path is new geometry,
      // but the source around it is the same one (file-format.md §4.3).
      source: { ...feature.source, path: PathOps.transform(feature.source.path, matrix) },
    };
  }

  // A **mirror** is the one derived feature with a placement of its own, so a
  // gesture lands in its parameters rather than being ignored. Two ways round,
  // and the difference is what makes a pair behave like an object:
  //
  // - moved **alone**, the axis absorbs the gesture (`T ∘ M`), so the
  //   counterpart goes where it is put and the original stays;
  // - moved **with its source**, the axis travels too (`T ∘ M ∘ T⁻¹`), so the
  //   assembly moves rigidly instead of sliding its halves apart.
  //
  // Either way the result is still a reflection-and-slide, so it can always be
  // said — see `decomposeGlide`.
  if (feature.source.kind === 'derived') {
    const op = feature.source.op;
    if (op.type !== 'mirror') return feature;

    // Only a captured axis absorbs a gesture. A fold-tracked counterpart is
    // placed by its fold, and `refusedTransforms` says so instead.
    if (op.axis.kind !== 'line') return feature;
    const current = glideMatrix(op.axis.origin, op.axis.angleRad, op.glideMm);
    const moved = withSource
      ? MatOps.composeAll(MatOps.invert(matrix), current, matrix)
      : MatOps.compose(current, matrix);

    const parts = decomposeGlide(moved);
    // Not an isometry — a scale or a shear. Left exactly as it was;
    // `refusedTransforms` is how the reason reaches the user.
    if (parts === null) return feature;

    return {
      ...feature,
      source: {
        ...feature.source,
        // Changed in place, so a newer build's fields on the mirror and its
        // axis stay (file-format.md §4.3).
        op: {
          ...op,
          axis: { ...op.axis, origin: parts.origin, angleRad: parts.angleRad },
          glideMm: parts.glideMm,
        },
      },
    };
  }

  // Only a shape is left: the measurement arm was returned above.
  if (feature.source.kind !== 'shape') return feature;

  // Only a shape is left: the measurement arm returned above.
  if (feature.source.kind !== 'shape') return feature;

  const result = transformShape(feature.source.shape, matrix);
  // Refused: left exactly as it was, rather than converted behind the user's
  // back. `refusedTransforms` is how the reason reaches them.
  if (!result.ok) return feature;

  return { ...feature, source: { ...feature.source, shape: result.value } };
}

/**
 * A part holding one parametric shape.
 *
 * The closed/open rule is the same product decision `pathPart` makes for drawn
 * geometry, stated once here for parametric shapes: a shape enclosing an area
 * is something to cut out, so it becomes a `cut-contour`; one with two ends is
 * a `marking-line`, because filing it as an outline would put a part in the
 * list that can never be cut.
 */
export function shapePart(
  partId: PartId,
  featureId: FeatureId,
  name: string,
  shape: ParametricShape,
): Part {
  const source = { kind: 'shape', shape } as const;
  const feature: Feature = enclosesArea(shape)
    ? {
        id: featureId,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source,
      }
    : {
        id: featureId,
        kind: 'marking-line',
        purpose: 'alignment',
        name: 'Line',
        visible: true,
        locked: false,
        source,
      };

  return { id: partId, name, quantity: 1, features: [feature] };
}

/** Whether a shape bounds an inside. Every new shape must answer this. */
function enclosesArea(shape: ParametricShape): boolean {
  switch (shape.type) {
    case 'rect':
    case 'circle':
      return true;
    case 'arc':
      // Two ends, so there is nothing inside it to cut out.
      return false;
  }
}

/**
 * A part holding one freehand path.
 *
 * A **closed** path becomes a `cut-contour`: an outline with an inside is
 * something to cut out. An **open** one becomes a `marking-line`, because a
 * line with two ends is not an outline, and calling it one would put a part in
 * the list that can never be cut. Drawn paths are the only geometry persisted
 * as coordinates rather than parameters (docs/file-format.md §3.3).
 */
export function pathPart(partId: PartId, featureId: FeatureId, name: string, path: Path): Part {
  const source = { kind: 'path', path } as const;
  const feature: Feature = path.closed
    ? {
        id: featureId,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source,
      }
    : {
        id: featureId,
        kind: 'marking-line',
        purpose: 'alignment',
        name: 'Line',
        visible: true,
        locked: false,
        source,
      };

  return { id: partId, name, quantity: 1, features: [feature] };
}

/**
 * A part holding one rectangle.
 *
 * Kept as a named helper because the rectangle tool and a good deal of the test
 * suite read better for it; the behaviour is `shapePart`'s, stated once.
 */
export function rectanglePart(
  partId: PartId,
  featureId: FeatureId,
  name: string,
  shape: Extract<ParametricShape, { type: 'rect' }>,
): Part {
  return shapePart(partId, featureId, name, shape);
}

export function rectShape(
  origin: Vec2,
  width: number,
  height: number,
  radius = 0,
  rotation = 0,
): Extract<ParametricShape, { type: 'rect' }> {
  return { type: 'rect', origin, width, height, radii: Shapes.uniformRadii(radius), rotation };
}

export function arcShape(
  centre: Vec2,
  radius: number,
  startAngle: number,
  sweepAngle: number,
): Extract<ParametricShape, { type: 'arc' }> {
  return { type: 'arc', centre, radius, startAngle, sweepAngle };
}

/**
 * The record stores a radius. The property panel asks for a diameter, because
 * that is the number on a punch — the conversion belongs there, not here.
 */
export function circleShape(
  centre: Vec2,
  radius: number,
): Extract<ParametricShape, { type: 'circle' }> {
  return { type: 'circle', centre, radius };
}

/**
 * A stitch line that follows a cut contour, inset from its edge.
 *
 * The inset is a *relationship*, not a copy: change the outline and this
 * follows. That is the whole point, and it is why there is no command to
 * create a detached stitch line from a path.
 */
export function addStitchLine(
  partId: PartId,
  featureId: FeatureId,
  sourceId: FeatureId,
  distanceMm?: Mm,
  run: Run = { kind: 'whole' },
): Command {
  return {
    label: 'Add Stitch line',
    apply: (document) => {
      // The project's stitch margin unless the caller insists (D7, X8). The
      // panel used to hard-code 3.5 mm, so a project set up for 4 mm quietly
      // got 3.5 every time.
      const inset = distanceMm ?? document.project.settings.defaultStitchInsetMm;

      return addDerived(partId, sourceId, {
        id: featureId,
        kind: 'stitch-line',
        name: 'Stitch line',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId,
          op: { type: 'offset', distanceMm: inset, side: 'inward', run },
        },
      }).apply(document);
    },
  };
}

/**
 * A stitch line drawn by hand rather than inset from an outline.
 *
 * The seam of a piece that has no outline yet — the other half of *Stitch +
 * allowance* (4.9), and the way a stitch line is drawn on a part whose edge
 * was drawn freehand.
 */
export function addDrawnStitchLine(
  partId: PartId,
  featureId: FeatureId,
  source: GeometrySource,
): Command {
  return addFeature(partId, {
    id: featureId,
    kind: 'stitch-line',
    name: 'Stitch line',
    visible: true,
    locked: false,
    source,
  });
}

/** Holes along a stitch line, at the pitch of a pricking iron. */
export function addStitchHoles(
  partId: PartId,
  featureId: FeatureId,
  sourceId: FeatureId,
  op?: Partial<Extract<Derivation, { type: 'stitch-holes' }>>,
): Command {
  return {
    label: 'Add Stitch holes',
    apply: (document) => {
      // The iron the project is set up for, unless the caller names another.
      const pitchMm = op?.pitchMm ?? document.project.settings.defaultIronPitchMm;

      return addDerived(partId, sourceId, {
        id: featureId,
        kind: 'stitch-hole-set',
        name: 'Stitch holes',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId,
          op: {
            type: 'stitch-holes',
            pitchMm,
            mode: op?.mode ?? 'fit-whole',
            corners: op?.corners ?? 'hole-at-corner',
            ...(op?.ironLabel === undefined ? {} : { ironLabel: op.ironLabel }),
            ...(op?.startOffsetMm === undefined ? {} : { startOffsetMm: op.startOffsetMm }),
            ...(op?.endOffsetMm === undefined ? {} : { endOffsetMm: op.endOffsetMm }),
          },
        },
      }).apply(document);
    },
  };
}

/** Changes what a derived feature does — the inset, the pitch, the run. */
export function setDerivation(id: FeatureId, op: Derivation): Command {
  return command('Edit derivation', (document) => ({
    project: mapFeature(document.project, id, (feature) =>
      feature.kind !== 'text-label' &&
      feature.kind !== 'measurement' &&
      feature.source.kind === 'derived'
        ? { ...feature, source: { ...feature.source, op } }
        : feature,
    ),
  }));
}

/**
 * Adds a derived feature, unless the reference graph would not allow it.
 *
 * The check is here rather than in evaluation so the document is never in a
 * cyclic or incompatible state at all. Evaluation keeps its own cycle guard,
 * which should be unreachable — and unreachable is where the next bug lives.
 */
function addDerived(partId: PartId, _sourceId: FeatureId, feature: Feature): Command {
  return addFeature(partId, feature);
}

export function setProjectName(name: string): Command {
  return command('Rename project', (document) => ({
    project: { ...document.project, name },
  }));
}

/**
 * Chooses the paper the project prints on and which way up (6.4a, 7.4a) —
 * **the one place it is decided**, read by the export through `pageSetupFor`.
 *
 * Paper and orientation are one choice, made from one list whose every entry
 * says what it prints ("1 sheet of A4, landscape"), so they are one command and
 * one undo step. Choosing what is already chosen changes nothing, so it earns
 * no history and does not make a clean project unsaved. Every other setting is
 * kept as it was, including one a newer build wrote (5.2).
 */
export function setPageSetup(paper: PaperName, orientation: Orientation): Command {
  return command('Change paper', (document) => {
    const { settings } = document.project;
    return settings.paper === paper && settings.orientation === orientation
      ? document
      : { project: { ...document.project, settings: { ...settings, paper, orientation } } };
  });
}

export function setPartName(id: PartId, name: string): Command {
  return command('Rename part', (document) => ({
    project: mapPart(document.project, id, (part) => ({ ...part, name })),
  }));
}

export function setPartQuantity(id: PartId, quantity: number): Command {
  return command('Set quantity', (document) => ({
    project: mapPart(document.project, id, (part) => ({
      ...part,
      // A part you cut zero of is a part you should delete instead.
      quantity: Math.max(1, Math.round(quantity)),
    })),
  }));
}

function mapPart(project: Project, id: PartId, update: (part: Part) => Part): Project {
  return {
    ...project,
    parts: project.parts.map((part) => (part.id === id ? update(part) : part)),
  };
}

/**
 * Edits one feature, **refusing a locked one** (S7).
 *
 * Refusing by default rather than at each call site is deliberate: a command
 * added later that forgets to think about the lock gets the safe answer, and
 * the two places that genuinely may touch a locked feature — hiding it and
 * unlocking it — say so out loud with `evenIfLocked`. The same reasoning as
 * the draw commit boundary in 4.3a: an invariant every caller has to remember
 * is one that eventually gets forgotten.
 *
 * Returns the project unchanged when refused; `lockRefusal` is how the reason
 * reaches the user.
 */
function mapFeature(
  project: Project,
  id: FeatureId,
  update: (feature: Feature) => Feature,
  options: { readonly evenIfLocked?: boolean } = {},
): Project {
  if (options.evenIfLocked !== true && lockRefusal(project, [id]) !== null) return project;

  // Nothing to edit is not an edit. Without this the project object would be
  // rebuilt anyway and the store, which decides by identity, would push an
  // undo entry for a command that changed nothing — "Undo Rename" with no
  // rename behind it.
  const found = project.parts.flatMap((part) => part.features).find((feature) => feature.id === id);
  if (found === undefined) return project;

  // An update that hands back the same feature is not an edit either. Several
  // commands refuse by returning their input — `setShape` on a derived feature,
  // for one — and without this the project would be rebuilt anyway and the
  // store, which decides by identity, would push an undo entry for nothing.
  if (update(found) === found) return project;

  return {
    ...project,
    parts: project.parts.map((part) =>
      part.features.some((feature) => feature.id === id)
        ? {
            ...part,
            features: part.features.map((feature) =>
              feature.id === id ? update(feature) : feature,
            ),
          }
        : part,
    ),
  };
}

/**
 * Where the leather bends rather than being cut.
 *
 * The name carries the direction because the canvas cannot: `ROLE_STROKES` is
 * keyed by layer role, so a mountain and a valley both draw dash-dot green, and
 * a cardholder with three folds needs them told apart somewhere. The parts list
 * is that somewhere. It is a default, not a derived label — renaming still
 * works.
 */
export function addFoldLine(
  partId: PartId,
  featureId: FeatureId,
  source: GeometrySource,
  direction: FoldLine['direction'] = 'valley',
): Command {
  return addFeature(partId, {
    id: featureId,
    kind: 'fold-line',
    direction,
    name: `Fold (${direction})`,
    visible: true,
    locked: false,
    source,
  });
}

/** How far a new dimension sits off what it measures, before anyone moves it. */
export const DEFAULT_DIMENSION_OFFSET_MM = 8;

/**
 * A dimension between two places on the drawing.
 *
 * Both ends are **anchors** — durable places defined by a feature's
 * parameters, not coordinates (ADR 0010). That is what lets the number keep
 * meaning the same thing while the drawing changes around it, and it is the
 * whole reason this is worth more than a typed label.
 *
 * The measurement joins the part of its **first** reference, because a
 * dimension belongs to the piece it is about.
 */
export function addMeasurement(
  featureId: FeatureId,
  measure: MeasureKind,
  a: MeasureRef,
  b: MeasureRef,
  offsetMm: Mm = DEFAULT_DIMENSION_OFFSET_MM,
  precision: 0 | 1 | 2 = 1,
): Command {
  return {
    label: 'Add dimension',
    apply: (document) => {
      const home = findFeature(document.project, a.featureId);
      if (home === null || findFeature(document.project, b.featureId) === null) return document;

      const feature: Feature = {
        id: featureId,
        kind: 'measurement',
        name: 'Dimension',
        visible: true,
        locked: false,
        source: { kind: 'measurement', measure, a, b, offsetMm, precision },
      };

      return addFeature(home.part.id, feature).apply(document);
    },
  };
}

/** Moves a dimension line off the geometry, or changes what it shows. */
export function setMeasurement(
  id: FeatureId,
  change: { readonly offsetMm?: Mm; readonly precision?: 0 | 1 | 2 },
): Command {
  return command('Edit dimension', (document) => ({
    project: mapFeature(document.project, id, (feature) =>
      feature.kind === 'measurement'
        ? {
            ...feature,
            source: {
              ...feature.source,
              offsetMm: change.offsetMm ?? feature.source.offsetMm,
              precision: change.precision ?? feature.source.precision,
            },
          }
        : feature,
    ),
  }));
}

/**
 * Why a seam allowance cannot be grown from this feature, or `null`.
 *
 * Pure and shared with the interface, so the panel's button is disabled by the
 * same question the command refuses with (ADR 0013).
 */
export function allowanceRefusal(project: Project, stitchId: FeatureId): Problem | null {
  const found = findFeature(project, stitchId);
  if (found === null) return problem('FEATURE_MISSING', { featureId: stitchId });

  const { part, feature } = found;
  if (feature.kind !== 'stitch-line') {
    return problem('NOT_DERIVED', { featureId: feature.id, featureName: feature.name });
  }

  // Everything else the compatibility table has to say — the run must be
  // whole, the line must be closed — is asked by building the candidate and
  // handing it to the same check the loader uses (S4, S5, S6). One question,
  // one answer, wherever it is asked from.
  const candidate = allowanceFeature('probe' as FeatureId, stitchId, 1);
  return derivationRefusal(project, candidate) ?? additionRefusal(project, part.id, candidate);
}

/**
 * The cut edge of a piece, grown outward from the stitching that defines it.
 *
 * The other direction of one relationship (§3.4): a stitch line **inset** from
 * an outline is the common case; this is the one for when the *inside*
 * dimension is what matters — a pocket that has to take a card is specified by
 * its opening, and the edge is whatever leaves the allowance outside the seam.
 *
 * **Linked, not baked.** The edge is an ordinary derived feature, so editing
 * the opening — its size, its position — or retyping the allowance moves it,
 * and the file stores the relationship rather than one coordinate of the
 * result. The drawing mode and this action build the same derivation; there is
 * deliberately no second seam-allowance model.
 */
export function addAllowance(
  partId: PartId,
  featureId: FeatureId,
  stitchId: FeatureId,
  allowanceMm?: Mm,
): Command {
  return {
    label: 'Add seam allowance',
    apply: (document) => {
      if (allowanceRefusal(document.project, stitchId) !== null) return document;

      // One number serves both directions, so the project's stitch margin is
      // the allowance too (X8). The field keeps its name; the panel calls it
      // *Edge margin*, which reads correctly from either end.
      const allowance = allowanceMm ?? document.project.settings.defaultStitchInsetMm;

      return addFeature(partId, allowanceFeature(featureId, stitchId, allowance)).apply(document);
    },
  };
}

/**
 * A new part dimensioned from its opening: a drawn stitch line, and its edge.
 *
 * One command and one undo step, because the two are one thought. The stitch
 * line is the **root** — it is what the maker drew and what they will retype —
 * and the outline follows it, which is the first part in the product whose
 * edge is derived rather than drawn.
 */
export function addAllowancePart(
  partId: PartId,
  stitchId: FeatureId,
  outlineId: FeatureId,
  source: GeometrySource,
  allowanceMm?: Mm,
): Command {
  return {
    label: 'Add Pocket',
    apply: (document) => {
      const allowance = allowanceMm ?? document.project.settings.defaultStitchInsetMm;

      const part: Part = {
        id: partId,
        name: 'Pocket',
        quantity: 1,
        features: [
          {
            id: stitchId,
            kind: 'stitch-line',
            name: 'Stitch line',
            visible: true,
            locked: false,
            source,
          },
          allowanceFeature(outlineId, stitchId, allowance),
        ],
      };

      // Built whole and added whole: a part with a stitch line and no edge is
      // not a state this command should be able to leave behind.
      return { project: { ...document.project, parts: [...document.project.parts, part] } };
    },
  };
}

/** The derivation both ways in share, so they cannot drift apart. */
function allowanceFeature(featureId: FeatureId, stitchId: FeatureId, allowanceMm: Mm): Feature {
  return {
    id: featureId,
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId: stitchId,
      // Whole run only: an outline has to enclose the part, and a run between
      // two anchors does not (`allowance-needs-whole-run`).
      op: { type: 'offset', distanceMm: allowanceMm, side: 'outward', run: { kind: 'whole' } },
    },
  };
}

/**
 * A hole cut out of a part — a card slot, a thumb scoop, a buckle window.
 *
 * An inner contour, so it is cut like the outline and counted as a cut
 * (§3.1), and so the part's material is the leather **outside** it: a stitch
 * line round a cut-out runs away from the hole (D6).
 *
 * Refused if it does not enclose an area (S6): a shape with two ends cuts
 * nothing. `additionRefusal` is how the reason reaches the user.
 */
export function addCutOut(partId: PartId, featureId: FeatureId, source: GeometrySource): Command {
  return addFeature(partId, {
    id: featureId,
    kind: 'cut-contour',
    role: 'inner',
    name: 'Cut-out',
    visible: true,
    locked: false,
    source,
  });
}

/** A printed guide — glue areas, alignment, logo placement. Never cut. */
export function addMarkingLine(
  partId: PartId,
  featureId: FeatureId,
  source: GeometrySource,
  purpose: MarkingLine['purpose'] = 'alignment',
): Command {
  return addFeature(partId, {
    id: featureId,
    kind: 'marking-line',
    purpose,
    name: MARKING_NAMES[purpose],
    visible: true,
    locked: false,
    source,
  });
}

const MARKING_NAMES: Readonly<Record<MarkingLine['purpose'], string>> = {
  'glue-area': 'Glue area',
  alignment: 'Alignment',
  logo: 'Logo',
  skive: 'Skive',
  other: 'Marking line',
};

/**
 * A hole punched for hardware.
 *
 * Takes a **radius**, like every other circle in the model. The panel and the
 * tool ask the user for a diameter and halve it before they get here, because
 * the punch is stamped with a diameter and the record holds one number.
 */
export function addHardwareHole(
  partId: PartId,
  featureId: FeatureId,
  centre: Vec2,
  radiusMm: Mm,
  hardwareType: HardwareHole['hardwareType'] = 'rivet',
): Command {
  return addFeature(partId, {
    id: featureId,
    kind: 'hardware-hole',
    hardwareType,
    // "4" rather than "4.00", and "2.5" rather than "2.50".
    name: `${HARDWARE_NAMES[hardwareType]} ${formatEditable(radiusMm * 2, 2)} mm`,
    visible: true,
    locked: false,
    source: { kind: 'shape', shape: circleShape(centre, radiusMm) },
  });
}

/**
 * How big a new label is, in millimetres.
 *
 * Small enough to sit inside a panel, large enough to read on a printed
 * template. A project setting when defaults move there in slice 4.3 (X8); a
 * constant until then, rather than a number typed in three places.
 */
export const DEFAULT_LABEL_SIZE_MM: Mm = 3;

/**
 * Free text printed on the template.
 *
 * The words live in the source, like a hardware hole's position lives in its
 * circle: moving, turning and scaling then work on a label without any of them
 * needing to know what a label is.
 *
 * Blank text is refused rather than stored — an empty label is invisible on
 * screen and on paper, and a feature nobody can see or select is a way to lose
 * work.
 */
export function addTextLabel(
  partId: PartId,
  featureId: FeatureId,
  at: Vec2,
  text = 'Text',
  sizeMm: Mm = DEFAULT_LABEL_SIZE_MM,
): Command {
  const words = text.trim();

  return command(`Add ${words === '' ? 'label' : words}`, (document) => {
    if (words === '' || !(sizeMm > 0)) return document;

    return {
      project: mapPart(document.project, partId, (part) => ({
        ...part,
        features: [
          ...part.features,
          {
            id: featureId,
            kind: 'text-label',
            name: words,
            visible: true,
            locked: false,
            source: { kind: 'text', text: words, at, sizeMm, rotationRad: 0 },
          },
        ],
      })),
    };
  });
}

/**
 * Retypes a label.
 *
 * The feature's name follows the words, because a label in the parts list that
 * says "Text" while the canvas says "fold here" is a list you stop reading.
 */
export function setLabelText(id: FeatureId, text: string): Command {
  const words = text.trim();

  return command('Edit label', (document) => {
    if (words === '') return document;

    return {
      project: mapFeature(document.project, id, (feature) =>
        feature.kind === 'text-label'
          ? { ...feature, name: words, source: { ...feature.source, text: words } }
          : feature,
      ),
    };
  });
}

/** Resizes a label, in millimetres, like everything else that can be printed. */
export function setLabelSize(id: FeatureId, sizeMm: Mm): Command {
  return command('Resize label', (document) => {
    if (!(sizeMm > 0)) return document;

    return {
      project: mapFeature(document.project, id, (feature) =>
        feature.kind === 'text-label'
          ? { ...feature, source: { ...feature.source, sizeMm } }
          : feature,
      ),
    };
  });
}

const HARDWARE_NAMES: Readonly<Record<HardwareHole['hardwareType'], string>> = {
  rivet: 'Rivet',
  snap: 'Snap',
  screw: 'Screw',
  eyelet: 'Eyelet',
  other: 'Hole',
};

/**
 * Changes a feature's own parameters — the ones that are not its geometry.
 *
 * A fold's direction, a marking line's purpose, a hole's hardware type: each is
 * a single field on a single kind, and each would otherwise be its own
 * near-identical command. The `kind` is passed so the update cannot be applied
 * to the wrong variant, and the label is passed so undo says what happened
 * rather than "Edit feature".
 */
function setFeatureField<K extends Feature['kind']>(
  id: FeatureId,
  kind: K,
  label: string,
  update: (feature: Extract<Feature, { kind: K }>) => Extract<Feature, { kind: K }>,
): Command {
  return command(label, (document) => ({
    project: mapFeature(document.project, id, (feature) =>
      feature.kind === kind ? update(feature as Extract<Feature, { kind: K }>) : feature,
    ),
  }));
}

export function setFoldDirection(id: FeatureId, direction: FoldLine['direction']): Command {
  return setFeatureField(id, 'fold-line', 'Change fold direction', (fold) => ({
    ...fold,
    direction,
  }));
}

/** Undefined means "inherit from the part" — see `FoldLineEditor`. */
export function setFoldThickness(id: FeatureId, materialThicknessMm: Mm | undefined): Command {
  return setFeatureField(id, 'fold-line', 'Change fold thickness', (fold) => {
    if (materialThicknessMm === undefined) {
      const { materialThicknessMm: _dropped, ...rest } = fold;
      return rest;
    }
    return { ...fold, materialThicknessMm };
  });
}

export function setMarkingPurpose(id: FeatureId, purpose: MarkingLine['purpose']): Command {
  return setFeatureField(id, 'marking-line', 'Change marking purpose', (mark) => ({
    ...mark,
    purpose,
  }));
}

export function setHardwareType(
  id: FeatureId,
  hardwareType: HardwareHole['hardwareType'],
): Command {
  return setFeatureField(id, 'hardware-hole', 'Change hardware type', (hole) => ({
    ...hole,
    hardwareType,
  }));
}

/** What to do with the features that depend on the ones being deleted. */
export type DeleteResolution = 'delete-dependents' | 'freeze-dependents';

export interface PlannedDependent {
  readonly featureId: FeatureId;
  readonly name: string;
  readonly kind: FeatureKind;
  readonly partId: PartId;
  readonly partName: string;
  /** Follows one of the deleted features itself, rather than through another. */
  readonly direct: boolean;
  /**
   * Could be kept as drawn geometry. Only a direct dependent that has a drawn
   * form and currently resolves: a hole set exists only as holes along a line,
   * and a feature that fails to build has no geometry to keep.
   */
  readonly freezable: boolean;
}

export interface DeletePlan {
  /** The requested features that exist, in document order. */
  readonly requested: readonly FeatureId[];
  readonly dependents: readonly PlannedDependent[];
}

/**
 * What deleting `ids` would touch — the one answer the dialog and the command
 * share (ADR 0009). Pure.
 */
export function planDelete(project: Project, ids: Iterable<FeatureId>): DeletePlan {
  const wanted = new Set(ids);
  const entries = project.parts.flatMap((part) =>
    part.features.map((feature) => ({ part, feature })),
  );
  const requested = entries.filter((e) => wanted.has(e.feature.id)).map((e) => e.feature.id);
  const requestedSet = new Set(requested);

  const dependentIds = dependentsOf(project, requested);
  if (dependentIds.length === 0) return { requested, dependents: [] };

  const resolved = new Map(
    evaluate(project)
      .parts.flatMap((part) => part.features)
      .map((entry) => [entry.feature.id, entry] as const),
  );

  const dependents = dependentIds.map((id): PlannedDependent => {
    const { part, feature } = entries.find((e) => e.feature.id === id)!;
    const direct = feature.source.kind === 'derived' && requestedSet.has(feature.source.sourceId);
    return {
      featureId: id,
      name: feature.name,
      kind: feature.kind,
      partId: part.id,
      partName: part.name,
      direct,
      // A measurement is never freezable, for the reason a hole set is not:
      // there is no drawn form to keep. Worse, a frozen dimension is a number
      // that no longer means anything — the stale label this feature exists to
      // replace. A counterpart losing its fold is freezable without being
      // `direct`: it depends on the fold through the references edge.
      freezable:
        withCapturedAxis(project, feature, requestedSet) !== null ||
        (direct &&
          feature.kind !== 'stitch-hole-set' &&
          feature.kind !== 'measurement' &&
          resolved.get(id)?.ok === true),
    };
  });

  return { requested, dependents };
}

/**
 * Deletes a part and its features.
 *
 * Planned exactly like `deleteFeatures`: anything outside the part that depends
 * on its features needs a resolution first. An empty part simply goes.
 */
export function deletePart(partId: PartId, resolution?: DeleteResolution): Command {
  return {
    label: 'Delete part',
    labelFor: (document) => {
      const part = document.project.parts.find((p) => p.id === partId);
      if (part === undefined) return 'Delete part';
      const ids = part.features.map((f) => f.id);
      return deleteLabel(document.project, ids, resolution, part.name);
    },
    apply: (document) => {
      const part = document.project.parts.find((p) => p.id === partId);
      if (part === undefined) return document;

      const outcome = resolveDelete(
        document.project,
        part.features.map((f) => f.id),
        resolution,
      );
      if (outcome === null) return document;

      const project = applyOutcome(document.project, outcome);
      return { project: { ...project, parts: project.parts.filter((p) => p.id !== partId) } };
    },
  };
}

/**
 * Whether a part is showing.
 *
 * Derived from its features rather than stored: a part is hidden when nothing
 * in it is visible. No `Part.visible` field means no format version and no
 * migration for what is a view convenience.
 *
 * **The cost, stated rather than hidden:** hiding a whole part and showing it
 * again forgets which single features were hidden beforehand. If that turns
 * out to matter, a persisted field is one migration away — this is the cheaper
 * thing first, not the permanent answer.
 */
export function isPartVisible(part: Part): boolean {
  return part.features.length === 0 || part.features.some((feature) => feature.visible);
}

/**
 * Shows or hides every feature in a part.
 *
 * Locked features included: the lock protects the piece, not the view.
 */
export function setPartVisible(partId: PartId, visible: boolean): Command {
  return command(visible ? 'Show part' : 'Hide part', (document) => ({
    project: mapPart(document.project, partId, (part) => ({
      ...part,
      features: part.features.map((feature) => ({ ...feature, visible })),
    })),
  }));
}

/**
 * Copies a part, re-pointing the derivations inside it (§3.2).
 *
 * A duplicate is a **copy with no relationship** to its original — that is
 * what separates it from a mirror (4.8), whose counterpart stays linked. So
 * every `derived` source *inside* the part is re-pointed to the copy, which is
 * what makes the copy's stitch line follow the copy's outline; a source
 * reaching into another part is left exactly where it was, because it still
 * means that other part.
 *
 * The ids are given rather than made, so the command stays a pure description
 * of an edit like every other one. One per feature, in document order; too few
 * refuses and changes nothing rather than duplicating half a part.
 *
 * The copy is placed clear of the original, because a copy drawn exactly on
 * top of its original is invisible and the first thing anyone would do is drag
 * it off. Only the copy's **root** features are moved — the derived ones
 * follow on their own, which is both correct and why this costs nothing.
 */
export function duplicatePart(
  partId: PartId,
  newPartId: PartId,
  featureIds: readonly FeatureId[],
): Command {
  return {
    label: 'Duplicate part',
    labelFor: (document) => {
      const part = document.project.parts.find((p) => p.id === partId);
      return part === undefined ? 'Duplicate part' : `Duplicate ${part.name}`;
    },
    apply: (document) => {
      const part = document.project.parts.find((p) => p.id === partId);
      if (part === undefined) return document;
      if (featureIds.length < part.features.length) return document;

      const renamed = new Map<FeatureId, FeatureId>(
        part.features.map((feature, i) => [feature.id, featureIds[i]!] as const),
      );

      const features = part.features.map((feature): Feature => {
        const id = renamed.get(feature.id)!;
        // Built unlocked, and locked again once it is in place. A copy of a
        // locked outline is still locked — but the lock belongs to the
        // finished copy, not to the act of making it, and leaving it on here
        // would make the placement below refuse itself and drop the copy
        // exactly on top of the original.
        const unlocked = { locked: false };

        // A label's source is its words, so it can never be re-pointed —
        // narrowing the feature rather than only its source is what lets the
        // copy below be built at all.
        if (
          feature.kind === 'text-label' ||
          feature.kind === 'measurement' ||
          feature.source.kind !== 'derived'
        ) {
          return { ...feature, ...unlocked, id };
        }

        // Inside the part: follow the copy. Outside it: unchanged, so the copy
        // points where the original pointed and no reference is created into
        // or out of the copy.
        const sourceId = renamed.get(feature.source.sourceId) ?? feature.source.sourceId;
        return { ...feature, ...unlocked, id, source: { ...feature.source, sourceId } };
      });

      const copy: Part = { ...part, id: newPartId, name: `${part.name} copy`, features };
      const withCopy: Project = { ...document.project, parts: [...document.project.parts, copy] };

      const wasLocked = new Map<FeatureId, boolean>(
        part.features.map((feature, i) => [featureIds[i]!, feature.locked] as const),
      );

      return { project: relock(moveClear(withCopy, copy), newPartId, wasLocked) };
    },
  };
}

/** Puts the copies' locks back, once the copy has been placed. */
function relock(
  project: Project,
  partId: PartId,
  wasLocked: ReadonlyMap<FeatureId, boolean>,
): Project {
  return mapPart(project, partId, (part) => ({
    ...part,
    features: part.features.map((feature) => ({
      ...feature,
      locked: wasLocked.get(feature.id) ?? feature.locked,
    })),
  }));
}

/**
 * The fold, captured as the line it currently is.
 *
 * `null` when it cannot be one — a bent fold, or one that does not resolve —
 * in which case there is nothing to freeze to and the counterpart goes with
 * the fold instead.
 */
function capturedLineOf(project: Project, foldId: FeatureId): MirrorAxis | null {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === foldId);
  if (entry?.ok !== true) return null;

  const lines = entry.path.segments.filter((segment) => segment.kind === 'line');
  const first = lines[0];
  if (first === undefined || lines.length !== entry.path.segments.length) return null;

  const angleRad = Math.atan2(first.b.y - first.a.y, first.b.x - first.a.x);
  return { kind: 'line', origin: first.a, angleRad };
}

/**
 * A counterpart frozen by **capturing the line its fold currently is**, or
 * `null` when deleting `gone` does not call for that.
 *
 * It keeps its shape, keeps following its source, and stops tracking the fold —
 * which is exactly what "freeze" has always meant, applied to the reference
 * edge instead of the derivation one.
 *
 * Not when the source goes too: nothing would be left to mirror, and the
 * counterpart is then an ordinary direct dependent, frozen as drawn geometry.
 *
 * One function for the plan and the command, so the dialog cannot offer a
 * freeze the command does not perform, or hide one it does.
 */
function withCapturedAxis(
  project: Project,
  feature: Feature,
  gone: ReadonlySet<FeatureId>,
): Feature | null {
  if (
    feature.kind === 'text-label' ||
    feature.kind === 'measurement' ||
    feature.source.kind !== 'derived'
  ) {
    return null;
  }
  const op = feature.source.op;
  if (op.type !== 'mirror' || op.axis.kind !== 'fold') return null;
  if (!gone.has(op.axis.foldId) || gone.has(feature.source.sourceId)) return null;

  const line = capturedLineOf(project, op.axis.foldId);
  if (line === null) return null;
  return { ...feature, source: { ...feature.source, op: { ...op, axis: line } } };
}

/** How far a duplicate sits from the piece it was copied from. */
const DUPLICATE_GAP_MM = 5;

/**
 * Shifts a freshly made copy to the right of everything already drawn.
 *
 * Measured from the whole project rather than from the original alone, so
 * duplicating the same part twice does not stack two copies in one place.
 */
function moveClear(project: Project, copy: Part): Project {
  const resolved = evaluate(project);

  const boxesIn = (partId: PartId): Rect[] =>
    resolved.parts
      .filter((entry) => entry.part.id === partId)
      .flatMap((entry) =>
        entry.features.flatMap((feature) => {
          const box = feature.ok ? PathOps.bbox(feature.path) : null;
          return box === null ? [] : [box];
        }),
      );

  const everything = RectOps.unionAll(
    resolved.parts.flatMap((entry) => boxesIn(entry.part.id)).filter((box) => box !== null),
  );
  const mine = RectOps.unionAll(boxesIn(copy.id));
  if (everything === null || mine === null) return project;

  const deltaMm = { x: everything.maxX - mine.minX + DUPLICATE_GAP_MM, y: 0 };
  // Only what was drawn: a derived feature is refused a move of its own
  // (X3) and does not need one — it follows what it was built from.
  const roots = copy.features.filter((f) => f.source.kind !== 'derived').map((f) => f.id);

  return transformFeatures(roots, MatOps.fromTranslation(deltaMm)).apply({ project }).project;
}

/**
 * Which way *Mirror ↔* and *Mirror ↕* fold.
 *
 * Named for what the maker sees happen, as `FlipAxis` is: `horizontal` puts
 * the counterpart to the right, across a vertical line.
 */
export type MirrorDirection = 'horizontal' | 'vertical';

/** A captured mirror axis, as *Mirror ↔ / ↕* measure one. */
export interface Axis {
  readonly origin: Vec2;
  readonly angleRad: number;
}

/** How far a mirrored counterpart sits from its original: touching. */
const MIRROR_GAP_MM = 0;

/**
 * The line *Mirror ↔ / ↕* folds about, or `null` when there is nothing to
 * measure.
 *
 * **Defined exactly, because for an upright panel every interpretation agrees
 * and for a turned one they do not** (the design's §8):
 *
 * - **world millimetres**, the frame the rulers show and every stored
 *   coordinate uses;
 * - the bounding box is **world-axis-aligned**, not turned to the selection —
 *   "↔" means left-and-right *in the drawing*, which is what the glyph says,
 *   and a selection of two differently-turned features has no local frame to
 *   align to anyway;
 * - **horizontal** takes the vertical line through the box's maximum x;
 *   **vertical** takes the horizontal line through its minimum y. So the
 *   counterpart lands immediately right of, or below, the selection, touching.
 *
 * For a turned piece the world box is larger than the piece, so the
 * counterpart sits beside the *box*. That is accepted rather than worked
 * around: predictability is worth more than a snug fit here, and mirroring
 * across a fold line — 4.8b — is the gesture for folding along a line that is
 * not square to the world.
 *
 * The axis is computed **once** and then stored absolutely. It never tracks
 * the source: an axis that chased a bounding box would jump whenever the
 * geometry changed, moving the counterpart by twice as much for reasons
 * nobody could see.
 */
export function mirrorAxisFor(
  project: Project,
  ids: Iterable<FeatureId>,
  axis: MirrorDirection,
): Axis | null {
  const wanted = new Set(ids);
  if (wanted.size === 0) return null;

  const boxes: Rect[] = [];
  for (const part of evaluate(project).parts) {
    for (const entry of part.features) {
      if (!entry.ok || !wanted.has(entry.feature.id)) continue;
      const box = PathOps.bbox(entry.path);
      if (box !== null) boxes.push(box);
    }
  }

  const bounds = RectOps.unionAll(boxes);
  if (bounds === null) return null;

  return axis === 'horizontal'
    ? { origin: { x: bounds.maxX + MIRROR_GAP_MM, y: bounds.minY }, angleRad: Math.PI / 2 }
    : { origin: { x: bounds.minX, y: bounds.minY - MIRROR_GAP_MM }, angleRad: 0 };
}

/**
 * Why this selection cannot be mirrored, or `null`.
 *
 * Pure, and shared with the interface, so a disabled button and a refused
 * command cannot disagree (ADR 0013).
 */
export function mirrorRefusal(
  project: Project,
  ids: Iterable<FeatureId>,
  axis: MirrorDirection = 'horizontal',
): Problem | null {
  const wanted = [...new Set(ids)];

  // A label is refused outright: a mirror is a similarity, so mirrored words
  // come out rotated rather than reflected — the right way round in the wrong
  // place, which is defect D2's silent wrongness in another costume.
  const byId = new Map(
    project.parts.flatMap((part) => part.features).map((f) => [f.id, f] as const),
  );
  for (const id of wanted) {
    const feature = byId.get(id);
    if (feature?.kind === 'text-label') return problem('TEXT_WOULD_READ_BACKWARDS', {});
  }

  return mirrorAxisFor(project, wanted, axis) === null ? problem('MIRROR_NO_AXIS', {}) : null;
}

/**
 * Counterparts that stay matched: each selected feature, reflected.
 *
 * Every counterpart mirrors **its own** original rather than being re-derived
 * from the mirrored outline. That is what makes a mirrored hole set have
 * exactly as many holes as the set it came from — redistributing along a
 * nominally-equal path can come out one short, and two panels sewn together
 * have to match (ADR 0012).
 *
 * The counterparts join **the same part**: a pair of card slots belongs to the
 * panel they are cut in. Mirroring a whole part into a new one is 4.8b.
 *
 * The ids are given rather than made, so the command stays a pure description
 * of an edit; too few refuses and changes nothing.
 */
export function mirrorFeatures(
  ids: readonly FeatureId[],
  newIds: readonly FeatureId[],
  axis: Axis,
): Command {
  return {
    label: ids.length === 1 ? 'Mirror' : `Mirror ${String(ids.length)} features`,
    apply: (document) => {
      const wanted = [...new Set(ids)];
      if (wanted.length === 0 || newIds.length < wanted.length) return document;
      if (mirrorRefusal(document.project, wanted) !== null) return document;

      const renamed = new Map(wanted.map((id, i) => [id, newIds[i]!] as const));

      return {
        project: {
          ...document.project,
          parts: document.project.parts.map((part) => {
            const made = part.features.flatMap((feature) => {
              const newId = renamed.get(feature.id);
              if (newId === undefined || feature.kind === 'text-label') return [];
              return [counterpartOf(feature, newId, { kind: 'line', ...axis })];
            });
            return made.length === 0 ? part : { ...part, features: [...part.features, ...made] };
          }),
        },
      };
    },
  };
}

/**
 * Why this selection cannot be folded about this fold, or `null`.
 *
 * Pure and shared with the interface, so a disabled button carries the same
 * reason the command would give (ADR 0013).
 */
export function foldMirrorRefusal(
  project: Project,
  ids: Iterable<FeatureId>,
  foldId: FeatureId,
): Problem | null {
  const wanted = [...new Set(ids)];
  const byId = new Map(
    project.parts.flatMap((part) => part.features).map((f) => [f.id, f] as const),
  );

  const fold = byId.get(foldId);
  if (fold === undefined || fold.kind !== 'fold-line') {
    return problem('MIRROR_FOLD_MISSING', {
      featureId: foldId,
      featureName: fold?.name ?? 'That feature',
      foldId,
    });
  }

  for (const id of wanted) {
    const feature = byId.get(id);
    if (feature === undefined) continue;

    // The fold is the axis, not something to mirror about itself.
    if (feature.id === foldId) return problem('MIRROR_NO_AXIS', {});

    // S5, said **before** the gesture rather than after it. A piece of leather
    // has one edge, and completing a contour from half of one needs a boolean
    // union this project does not have and deliberately has not bought
    // (ADR 0008). The message names both real alternatives.
    if (feature.kind === 'cut-contour' && feature.role === 'outer') {
      const part = project.parts.find((candidate) =>
        candidate.features.some((f) => f.id === feature.id),
      );
      return problem('MIRROR_OUTLINE_ACROSS_FOLD', {
        featureId: feature.id,
        featureName: feature.name,
        partName: part?.name ?? 'This part',
      });
    }
  }

  return mirrorRefusal(project, wanted);
}

/**
 * Counterparts folded about a fold line — symmetry a maker keeps working with.
 *
 * The difference from `mirrorFeatures` is the whole slice. That one captures a
 * line and freezes it, so widening the piece afterwards leaves the counterpart
 * behind. This one **references the fold**, so moving the fold re-mirrors
 * everything folded about it: a wallet's card slots stay the mirror of each
 * other while its width is still being decided.
 *
 * The counterparts join the **same part**, because a fold is inside one piece
 * of leather. Two separate pieces — a left and a right — are `mirrorFeatures`
 * with a captured axis instead.
 *
 * The fold is **named, never inferred**: no nearest-fold heuristic, because a
 * mirror about the wrong line is not visibly wrong until the leather is cut.
 */
export function mirrorAcrossFold(
  ids: readonly FeatureId[],
  newIds: readonly FeatureId[],
  foldId: FeatureId,
): Command {
  return {
    label: ids.length === 1 ? 'Mirror across fold' : `Mirror ${String(ids.length)} across fold`,
    apply: (document) => {
      const wanted = [...new Set(ids)];
      if (wanted.length === 0 || newIds.length < wanted.length) return document;
      if (foldMirrorRefusal(document.project, wanted, foldId) !== null) return document;

      const renamed = new Map(wanted.map((id, i) => [id, newIds[i]!] as const));

      return {
        project: {
          ...document.project,
          parts: document.project.parts.map((part) => {
            const made = part.features.flatMap((feature) => {
              const newId = renamed.get(feature.id);
              if (newId === undefined || feature.kind === 'text-label') return [];
              return [counterpartOf(feature, newId, { kind: 'fold', foldId })];
            });
            return made.length === 0 ? part : { ...part, features: [...part.features, ...made] };
          }),
        },
      };
    },
  };
}

/**
 * The same feature, mirror-derived from itself: same kind, same role.
 *
 * A label is excluded by the type, not by a check: its source is its words, so
 * it has nowhere to put a derivation, and `mirrorRefusal` has already turned
 * one away before this is reached.
 */
function counterpartOf(
  feature: Exclude<Feature, { kind: 'text-label' }>,
  id: FeatureId,
  axis: MirrorAxis,
): Feature {
  const source = {
    kind: 'derived' as const,
    sourceId: feature.id,
    op: { type: 'mirror' as const, axis, glideMm: 0 },
  };

  return {
    ...feature,
    id,
    name: `${feature.name} mirrored`,
    // A counterpart's own, not its original's: it starts visible and free
    // whatever the original happens to be.
    visible: true,
    locked: false,
    source,
  } as Feature;
}

/**
 * Makes a derived feature follow a different source, keeping its parameters.
 *
 * How an outline is replaced without losing the stitching that followed it.
 * Refuses — changing nothing — whatever `followRefusal` refuses.
 */
export function setSource(id: FeatureId, sourceId: FeatureId): Command {
  return {
    label: 'Follow another feature',
    labelFor: (document) => {
      const source = document.project.parts
        .flatMap((p) => p.features)
        .find((f) => f.id === sourceId);
      return source === undefined ? 'Follow another feature' : `Follow ${source.name}`;
    },
    apply: (document) => {
      if (followRefusal(document.project, id, sourceId) !== null) return document;
      return {
        project: mapFeature(document.project, id, (feature) =>
          feature.kind !== 'text-label' &&
          feature.kind !== 'measurement' &&
          feature.source.kind === 'derived'
            ? { ...feature, source: { ...feature.source, sourceId } }
            : feature,
        ),
      };
    },
  };
}

interface DeleteOutcome {
  /** Every feature that goes, requested or not. */
  readonly gone: ReadonlySet<FeatureId>;
  /** Features kept as drawn geometry, by id. */
  readonly frozen: ReadonlyMap<FeatureId, Feature>;
  readonly requestedCount: number;
}

/**
 * What a delete actually does, or null when it must be refused.
 *
 * Shared by the command and its undo label, so the menu cannot describe a
 * different delete from the one that happened.
 */
function resolveDelete(
  project: Project,
  ids: readonly FeatureId[],
  resolution: DeleteResolution | undefined,
): DeleteOutcome | null {
  const plan = planDelete(project, ids);

  // S7, over the cascade rather than only the request: deleting an outline
  // would delete or freeze the stitch line that follows it, and if *that* is
  // locked the user pinned it down precisely so this could not happen to it.
  const touched = [...plan.requested, ...plan.dependents.map((d) => d.featureId)];
  if (lockRefusal(project, touched) !== null) return null;

  const gone = new Set(plan.requested);
  const frozen = new Map<FeatureId, Feature>();

  if (plan.dependents.length === 0) return { gone, frozen, requestedCount: plan.requested.length };
  if (resolution === undefined) return null;

  if (resolution === 'delete-dependents') {
    for (const dependent of plan.dependents) gone.add(dependent.featureId);
    return { gone, frozen, requestedCount: plan.requested.length };
  }

  const byId = new Map(
    project.parts.flatMap((part) => part.features).map((f) => [f.id, f] as const),
  );
  const resolved = new Map(
    evaluate(project)
      .parts.flatMap((part) => part.features)
      .map((entry) => [entry.feature.id, entry] as const),
  );

  // A counterpart folded about a deleted fold is frozen by capturing the fold's
  // line, not by turning it into drawn geometry — see `withCapturedAxis`.
  const capturedAxes = new Map<FeatureId, Feature>();
  for (const feature of project.parts.flatMap((part) => part.features)) {
    const captured = withCapturedAxis(project, feature, gone);
    if (captured !== null) capturedAxes.set(feature.id, captured);
  }

  for (const dependent of plan.dependents) {
    // Asked **before** `direct`, which only knows the *derives* edge: a
    // counterpart depends on its fold through the **references** edge, so it
    // is a direct dependent of the fold without its `sourceId` saying so.
    //
    // What was deleted is its axis, not its source, so it keeps mirroring —
    // about the line the fold was on. Better than flattening it to a path,
    // because it still follows the piece it mirrors.
    const captured = capturedAxes.get(dependent.featureId);
    if (captured !== undefined) {
      frozen.set(dependent.featureId, captured);
      continue;
    }

    if (!dependent.direct) continue;
    const feature = byId.get(dependent.featureId)!;
    const entry = resolved.get(dependent.featureId);
    if (
      dependent.freezable &&
      entry?.ok === true &&
      feature.kind !== 'text-label' &&
      feature.kind !== 'measurement' &&
      feature.source.kind === 'derived'
    ) {
      const followed = byId.get(feature.source.sourceId);
      frozen.set(feature.id, {
        ...feature,
        source: { kind: 'path', path: entry.path },
        frozenFrom: followed?.name ?? 'a deleted feature',
      });
    } else {
      gone.add(dependent.featureId);
    }
  }

  // Whatever still follows something that is going — and not through a frozen
  // feature, which no longer follows anything — goes with it.
  const afterFreeze = applyOutcome(project, { gone: new Set(), frozen, requestedCount: 0 });
  for (const id of dependentsOf(afterFreeze, gone)) gone.add(id);

  return { gone, frozen, requestedCount: plan.requested.length };
}

/** Removes and freezes features, leaving untouched parts identical by reference. */
function applyOutcome(project: Project, outcome: DeleteOutcome): Project {
  return {
    ...project,
    parts: project.parts.map((part) =>
      part.features.some((f) => outcome.gone.has(f.id) || outcome.frozen.has(f.id))
        ? {
            ...part,
            features: part.features
              .filter((f) => !outcome.gone.has(f.id))
              .map((f) => outcome.frozen.get(f.id) ?? f),
          }
        : part,
    ),
  };
}

function deleteLabel(
  project: Project,
  ids: readonly FeatureId[],
  resolution: DeleteResolution | undefined,
  partName?: string,
): string {
  const names = project.parts.flatMap((p) => p.features).filter((f) => ids.includes(f.id));
  const what =
    partName ?? (names.length === 1 ? names[0]!.name : `${String(names.length)} features`);

  const outcome = resolveDelete(project, ids, resolution);
  if (outcome === null) return `Delete ${what}`;

  const deleted = outcome.gone.size - outcome.requestedCount;
  const kept = outcome.frozen.size;
  const dependents = (n: number): string => `${String(n)} dependent${n === 1 ? '' : 's'}`;

  if (kept > 0 && deleted > 0)
    return `Delete ${what} and ${dependents(deleted)}, keep ${String(kept)} frozen`;
  if (kept > 0) return `Delete ${what}, keep ${String(kept)} frozen`;
  if (deleted > 0) return `Delete ${what} and ${dependents(deleted)}`;
  return `Delete ${what}`;
}

/** Whether anything upstream of `feature` is among the features being moved. */
function movesWithItsSource(
  byId: ReadonlyMap<FeatureId, Feature>,
  feature: Feature,
  targets: ReadonlySet<FeatureId>,
): boolean {
  const seen = new Set<FeatureId>();
  let at: Feature | undefined = feature;
  while (at !== undefined && at.source.kind === 'derived' && !seen.has(at.id)) {
    seen.add(at.id);
    if (targets.has(at.source.sourceId)) return true;
    at = byId.get(at.source.sourceId);
  }
  return false;
}

/** The feature at the top of a derivation chain: the one that owns geometry. */
function rootOf(byId: ReadonlyMap<FeatureId, Feature>, feature: Feature): Feature {
  const seen = new Set<FeatureId>();
  let at = feature;
  while (at.source.kind === 'derived' && !seen.has(at.id)) {
    seen.add(at.id);
    const next = byId.get(at.source.sourceId);
    if (next === undefined) return at;
    at = next;
  }
  return at;
}
