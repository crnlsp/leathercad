import {
  evaluate,
  type Orientation,
  type PaperName,
  type Project,
  type ResolvedProject,
} from '@leathercad/domain';
import {
  buildExportScene,
  pageSetupFor,
  planEveryPaper,
  planSheets,
  printStatusOf,
  type ExportScene,
  type PartPrintStatus,
  type SheetPlan,
} from '@leathercad/export';

/**
 * The sheet plan for a project, **the one the PDF will write** (7.4a).
 *
 * Every surface that says anything about the paper reads it from here, and the
 * export writes the same object: `sheetPlanFor(project)` returns the identical
 * plan for the identical project, so what the maker was shown is what the file
 * contains. There is no other pagination in the renderer, and no approximation.
 *
 * A project is immutable — every edit makes a new one — so the plan is cached
 * by the project object itself and dropped with it. Nothing here is stored in
 * the document: the plan is derived (invariant 4).
 */
const resolutions = new WeakMap<Project, ResolvedProject>();
const scenes = new WeakMap<Project, ExportScene>();
const statuses = new WeakMap<Project, ReadonlyMap<string, PartPrintStatus>>();
const plans = new WeakMap<Project, SheetPlan>();
const options = new WeakMap<Project, readonly PaperOption[]>();

export interface PaperOption {
  readonly paper: PaperName;
  readonly orientation: Orientation;
  readonly plan: SheetPlan;
}

function resolvedFor(project: Project): ResolvedProject {
  let resolved = resolutions.get(project);
  if (resolved === undefined) {
    resolved = evaluate(project);
    resolutions.set(project, resolved);
  }
  return resolved;
}

/** The paper-independent export scene, built once per project. */
function sceneFor(project: Project): ExportScene {
  let scene = scenes.get(project);
  if (scene === undefined) {
    scene = buildExportScene(resolvedFor(project), project.name);
    scenes.set(project, scene);
  }
  return scene;
}

/**
 * What of each part reaches paper (7.4b), from `sheetPlanFor`'s plan — the one
 * the PDF writes — and the same evaluation it was built from.
 */
export function printStatusFor(project: Project): ReadonlyMap<string, PartPrintStatus> {
  let known = statuses.get(project);
  if (known === undefined) {
    known = printStatusOf(resolvedFor(project), sheetPlanFor(project));
    statuses.set(project, known);
  }
  return known;
}

/** The plan for the project's own paper: what Export PDF writes. */
export function sheetPlanFor(project: Project): SheetPlan {
  let plan = plans.get(project);
  if (plan === undefined) {
    plan = planSheets(sceneFor(project), pageSetupFor(project.settings));
    plans.set(project, plan);
  }
  return plan;
}

/**
 * The plan on every paper the maker can choose, for the paper list. The
 * chosen paper's entry is `sheetPlanFor`'s plan itself, not a second one.
 */
export function paperOptionsFor(project: Project): readonly PaperOption[] {
  let known = options.get(project);
  if (known === undefined) {
    const chosen = sheetPlanFor(project);
    const { paper, orientation } = project.settings;
    known = planEveryPaper(sceneFor(project)).map((option) =>
      option.paper === paper && option.orientation === orientation
        ? { ...option, plan: chosen }
        : option,
    );
    options.set(project, known);
  }
  return known;
}
