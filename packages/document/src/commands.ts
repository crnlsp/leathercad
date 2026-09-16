import type { Mm, Ulid } from '@leathercad/core';
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
  Problem,
  Project,
  Run,
} from '@leathercad/domain';
import {
  DEFAULT_SETTINGS,
  dependentsOf,
  derivationRefusal,
  evaluate,
  followRefusal,
  problem,
  transformShape,
  transformTextSource,
} from '@leathercad/domain';
import {
  MatOps,
  PathOps,
  RectOps,
  Shapes,
  type Mat2x3,
  type Path,
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

export function setFeatureVisible(id: FeatureId, visible: boolean): Command {
  return command(visible ? 'Show feature' : 'Hide feature', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, visible })),
  }));
}

/** Replaces a parametric shape — the path is regenerated on evaluation. */
export function setShape(id: FeatureId, shape: ParametricShape): Command {
  return command('Edit shape', (document) => ({
    project: mapFeature(document.project, id, (feature) =>
      // A label is made of words; it has no shape to replace, and asking for
      // one is a no-op rather than a way to turn it into a rectangle.
      feature.kind === 'text-label' ? feature : { ...feature, source: { kind: 'shape', shape } },
    ),
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

    return {
      project: {
        ...document.project,
        parts: document.project.parts.map((part) => ({
          ...part,
          features: part.features.map((feature) =>
            targets.has(feature.id) ? transformFeature(feature, matrix) : feature,
          ),
        })),
      },
    };
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
        // A derived feature has no geometry of its own to move. Moved with what
        // it follows, it follows; moved alone, nothing happens — and the user is
        // told why rather than left watching it not move (X3).
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

function transformFeature(feature: Feature, matrix: Mat2x3): Feature {
  // A label transforms through its parameters, exactly as a parametric shape
  // does: it stays a label you can retype, rather than becoming outlines.
  if (feature.kind === 'text-label') {
    const turned = transformTextSource(feature.source, matrix);
    return turned.ok ? { ...feature, source: turned.value } : feature;
  }

  if (feature.source.kind === 'path') {
    return {
      ...feature,
      source: { kind: 'path', path: PathOps.transform(feature.source.path, matrix) },
    };
  }

  // A derived feature has no geometry of its own to move: it follows the one
  // it is built from, and moving that moves this. Transforming it here would
  // detach it from its source, which is exactly what the derivation exists to
  // prevent.
  if (feature.source.kind === 'derived') return feature;

  const result = transformShape(feature.source.shape, matrix);
  // Refused: left exactly as it was, rather than converted behind the user's
  // back. `refusedTransforms` is how the reason reaches them.
  if (!result.ok) return feature;

  return { ...feature, source: { kind: 'shape', shape: result.value } };
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
  distanceMm: Mm,
  run: Run = { kind: 'whole' },
): Command {
  return addDerived(partId, sourceId, {
    id: featureId,
    kind: 'stitch-line',
    name: 'Stitch line',
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId,
      op: { type: 'offset', distanceMm, side: 'inward', run },
    },
  });
}

/** Holes along a stitch line, at the pitch of a pricking iron. */
export function addStitchHoles(
  partId: PartId,
  featureId: FeatureId,
  sourceId: FeatureId,
  op: Extract<Derivation, { type: 'stitch-holes' }>,
): Command {
  return addDerived(partId, sourceId, {
    id: featureId,
    kind: 'stitch-hole-set',
    name: 'Stitch holes',
    visible: true,
    locked: false,
    source: { kind: 'derived', sourceId, op },
  });
}

/** Changes what a derived feature does — the inset, the pitch, the run. */
export function setDerivation(id: FeatureId, op: Derivation): Command {
  return command('Edit derivation', (document) => ({
    project: mapFeature(document.project, id, (feature) =>
      feature.kind !== 'text-label' && feature.source.kind === 'derived'
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

function mapFeature(
  project: Project,
  id: FeatureId,
  update: (feature: Feature) => Feature,
): Project {
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
    name: `${HARDWARE_NAMES[hardwareType]} ${formatMm(radiusMm * 2)} mm`,
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

/** "4" rather than "4.00", and "2.5" rather than "2.50". */
function formatMm(value: Mm): string {
  return String(Number(value.toFixed(2)));
}

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
      freezable: direct && feature.kind !== 'stitch-hole-set' && resolved.get(id)?.ok === true,
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
          feature.kind !== 'text-label' && feature.source.kind === 'derived'
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

  for (const dependent of plan.dependents) {
    if (!dependent.direct) continue;
    const feature = byId.get(dependent.featureId)!;
    const entry = resolved.get(dependent.featureId);
    if (
      dependent.freezable &&
      entry?.ok === true &&
      feature.kind !== 'text-label' &&
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
