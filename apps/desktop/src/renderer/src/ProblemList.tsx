import {
  describeProblem,
  problemKey,
  problemTitle,
  type Diagnostic,
  type Project,
} from '@leathercad/domain';

/**
 * The rows every problem surface is made of.
 *
 * One component, because the problems panel and the property panel must not be
 * able to describe the same problem differently (X7). The words come from the
 * domain's catalogue; this decides only the arrangement.
 */
export function ProblemRows({
  diagnostics,
  project,
  onSelect,
  showWhere = true,
}: {
  diagnostics: readonly Diagnostic[];
  project: Project;
  /** Selecting the feature a problem is about. Omitted where it is already selected. */
  onSelect?: (featureId: string) => void;
  /** Whether to name the part and feature. Off in the property panel, which already has. */
  showWhere?: boolean;
}) {
  return (
    <>
      {diagnostics.map((diagnostic) => {
        const where = locate(project, diagnostic);
        const key = `${problemKey(diagnostic.problem)}:${diagnostic.partId}`;
        const body = (
          <>
            <span className={`problem-mark severity-${diagnostic.severity}`} aria-hidden="true" />
            <span className="problem-text">
              <span className="problem-title">{problemTitle(diagnostic.problem.code)}</span>
              {showWhere && where !== null && <span className="problem-where">{where}</span>}
              <span className="problem-message">{describeProblem(diagnostic.problem)}</span>
            </span>
          </>
        );

        const selectable = onSelect !== undefined && diagnostic.featureId !== undefined;
        return selectable ? (
          <button
            key={key}
            type="button"
            className="problem-row"
            data-testid="problem-row"
            data-code={diagnostic.problem.code}
            data-severity={diagnostic.severity}
            onClick={() => onSelect(diagnostic.featureId!)}
          >
            {body}
          </button>
        ) : (
          <div
            key={key}
            className="problem-row"
            data-testid="problem-row"
            data-code={diagnostic.problem.code}
            data-severity={diagnostic.severity}
          >
            {body}
          </div>
        );
      })}
    </>
  );
}

/** "Panel › Stitch line", or just the part for a problem with the part itself. */
function locate(project: Project, diagnostic: Diagnostic): string | null {
  const part = project.parts.find((p) => p.id === diagnostic.partId);
  if (part === undefined) return null;
  if (diagnostic.featureId === undefined) return part.name;

  const feature = part.features.find((f) => f.id === diagnostic.featureId);
  return feature === undefined ? part.name : `${part.name} › ${feature.name}`;
}
