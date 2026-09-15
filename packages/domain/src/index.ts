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
  ParametricShape,
  Run,
  Part,
  PartId,
  Project,
  ProjectSettings,
  StitchLine,
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
export { evaluate, evaluationErrors, resolvedFeatures } from './evaluate.js';

export { transformShape } from './transformShape.js';

export { anchorsOf, cornerDistances } from './anchors.js';

export type { GraphProblem, GraphProblemCode } from './graph.js';
export { dependentsOf, derivationRefusal, followRefusal, graphProblems } from './graph.js';

export type { RunReport, StitchHole, StitchHoles } from './stitch.js';
export { distributeHoles, splitAtCorners } from './stitch.js';
