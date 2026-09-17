/**
 * @leathercad/domain — leathercraft meaning on top of pure geometry.
 *
 * A path here is a *cut contour* or a *stitch line*, not a black stroke, and
 * that difference is the product. See docs/domain-model.md.
 *
 * Imports only core and geometry. Knows nothing about rendering, interaction
 * or file formats.
 */

export type { LayerRole } from './layerRole.js';
export { LAYER_ROLES, LAYER_ROLE_LABELS, isCutting } from './layerRole.js';

export type {
  CutContour,
  Feature,
  FeatureBase,
  FeatureId,
  FeatureKind,
  FoldLine,
  GeometrySource,
  HardwareHole,
  MarkingLine,
  Derivation,
  MirrorAxis,
  ParametricShape,
  Run,
  Part,
  PartId,
  Project,
  ProjectSettings,
  StitchLine,
  TextLabel,
  TextSource,
  FeatureSource,
} from './feature.js';
export {
  DEFAULT_SETTINGS,
  eachFeature,
  findFeature,
  findPart,
  isCutContour,
  roleOf,
} from './feature.js';

export type { ResolvedFeature, ResolvedPart, ResolvedProject } from './evaluate.js';
export { evaluate, evaluationErrors, pathForShape, resolvedFeatures } from './evaluate.js';

export { transformShape, transformTextSource } from './transformShape.js';

export {
  MIN_HOLES_IN_A_SET,
  SPACING_DEVIATION_FRACTION,
  SPACING_UNEVEN_FRACTION,
  validate,
} from './validate.js';
export { diagnose } from './diagnose.js';

export { anchorsOf, cornerDistances } from './anchors.js';

export type { Material } from './material.js';
export { allOnMaterial, distanceToEdge, isOnMaterial, materialOf } from './material.js';

export {
  dependentsOf,
  derivationRefusal,
  enclosesArea,
  followRefusal,
  graphProblems,
} from './graph.js';

export { additionRefusal, hasOuterContour, partStructureProblems } from './partStructure.js';
export type { FeatureNode } from './featureTree.js';
export { featureTree } from './featureTree.js';
export { lockRefusal, lockedAmong } from './lock.js';

export type {
  CodeInfo,
  CompatibilityRule,
  Diagnostic,
  InvariantId,
  Problem,
  ProblemCategory,
  ProblemCode,
  ProblemFacts,
  PlacedThing,
  ProblemLocation,
  Severity,
} from './problems/index.js';
export {
  PROBLEM_CODES,
  describeProblem,
  describeProblemWithSubject,
  problem,
  problemKey,
  problemTitle,
  sameProblem,
  subjectOf,
} from './problems/index.js';

export type { RunReport, StitchHole, StitchHoles } from './stitch.js';
export { distributeHoles, splitAtCorners } from './stitch.js';
