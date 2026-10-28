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
  type ExportRole,
  type ExportScene,
  type PartPrintStatus,
  type SheetPlan,
} from '@leathercad/export';

/**
 * The sheet plan for a project, **the one the PDF will write** (7.4a).
 *
 * Every surface that says anything about the paper reads it from here, and the
 * export writes the same object: while a project is the one on screen,
 * `sheetPlanFor(project)` returns the identical plan, so what the maker was
 * shown is what the file contains. There is no other pagination in the
 * renderer, and no approximation.
 *
 * A project is immutable — every edit makes a new one — so what is derived from
 * it is kept beside it, and only for **the project last asked about**: the one
 * on screen. Kept for every project in history, two hundred renames held two
 * hundred plans, 1.3 GiB of them (PERF-001). Undo derives an earlier project's
 * again: cheaply, because evaluation and the export scene reuse every feature
 * and part that did not change, and to the same plan, because a plan is a
 * function of the project alone. Nothing here is stored in the document: it is
 * derived (invariant 4).
 */
interface Derived {
  readonly project: Project;
  resolved?: ResolvedProject;
  scene?: ExportScene;
  statuses?: ReadonlyMap<string, PartPrintStatus>;
  plan?: SheetPlan;
  options?: readonly PaperOption[];
}

let latest: Derived | null = null;

function derivedFor(project: Project): Derived {
  if (latest?.project !== project) latest = { project };
  return latest;
}

export interface PaperOption {
  readonly paper: PaperName;
  readonly orientation: Orientation;
  readonly plan: SheetPlan;
}

/** The project evaluated once, the evaluation the plan and Properties read. */
export function resolvedFor(project: Project): ResolvedProject {
  const derived = derivedFor(project);
  return (derived.resolved ??= evaluate(project));
}

/** The paper-independent export scene, built once per project. */
function sceneFor(project: Project): ExportScene {
  const derived = derivedFor(project);
  return (derived.scene ??= buildExportScene(resolvedFor(project), project.name));
}

/**
 * The scene a vector file is written from (6.2, 6.5): the board's arrangement of
 * the layer roles the maker kept (6.4). The PDF never reads it; its scene is
 * `sheetPlanFor`'s, whole, so the Sheets view and the paper stay one thing.
 */
export function drawingSceneFor(project: Project, roles: readonly ExportRole[]): ExportScene {
  return buildExportScene(resolvedFor(project), project.name, roles);
}

/**
 * What of each part reaches paper (7.4b), from `sheetPlanFor`'s plan — the one
 * the PDF writes — and the same evaluation it was built from.
 */
export function printStatusFor(project: Project): ReadonlyMap<string, PartPrintStatus> {
  const derived = derivedFor(project);
  return (derived.statuses ??= printStatusOf(resolvedFor(project), sheetPlanFor(project)));
}

/** The plan for the project's own paper: what Export PDF writes. */
export function sheetPlanFor(project: Project): SheetPlan {
  const derived = derivedFor(project);
  return (derived.plan ??= planSheets(sceneFor(project), pageSetupFor(project.settings)));
}

/**
 * The plan on every paper the maker can choose, for the paper list. The
 * chosen paper's entry is `sheetPlanFor`'s plan itself, not a second one.
 */
export function paperOptionsFor(project: Project): readonly PaperOption[] {
  const derived = derivedFor(project);
  if (derived.options === undefined) {
    const chosen = sheetPlanFor(project);
    const { paper, orientation } = project.settings;
    derived.options = planEveryPaper(sceneFor(project)).map((option) =>
      option.paper === paper && option.orientation === orientation
        ? { ...option, plan: chosen }
        : option,
    );
  }
  return derived.options;
}
