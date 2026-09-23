import {
  describeProblem,
  problemKey,
  problemTitle,
  type Diagnostic,
  type Project,
} from '@leathercad/domain';
import { SeverityGlyph } from './SeverityGlyph.js';

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
  onGoTo,
  showWhere = true,
}: {
  diagnostics: readonly Diagnostic[];
  project: Project;
  /**
   * Going to a problem: selecting its subject and framing its evidence.
   * Omitted in the property panel, which is already showing what is selected.
   */
  onGoTo?: (diagnostic: Diagnostic) => void;
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
            <SeverityGlyph severity={diagnostic.severity} />
            <span className="problem-text">
              <span className="problem-title">{problemTitle(diagnostic.problem.code)}</span>
              {showWhere && where !== null && <span className="problem-where">{where}</span>}
              <span className="problem-message">{describeProblem(diagnostic.problem)}</span>
            </span>
          </>
        );

        // Every row, including a problem with the part itself: an empty part
        // is something to be taken to as much as a hole in the wrong place.
        return onGoTo !== undefined ? (
          <button
            key={key}
            type="button"
            className="problem-row"
            data-testid="problem-row"
            data-code={diagnostic.problem.code}
            data-severity={diagnostic.severity}
            onClick={() => onGoTo(diagnostic)}
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
