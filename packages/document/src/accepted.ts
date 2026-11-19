import { acceptance, diagnose, problemKey } from '@leathercad/domain';

import { command, type Command } from './document.js';

/**
 * Accepts the warning with `key` as it stands now (9.16): one undo step. An
 * error, an already accepted warning or a key nothing has changes nothing.
 * A stale acceptance of the same key — its cause since changed — is replaced.
 */
export function acceptWarning(key: string): Command {
  return command({ action: 'accept-warning' }, (document) => {
    const { project } = document;
    const found = diagnose(project).find(
      (d) => d.severity === 'warning' && d.accepted !== true && problemKey(d.problem) === key,
    );
    if (found === undefined) return document;
    const kept = (project.acceptedWarnings ?? []).filter((entry) => entry.problemKey !== key);
    return {
      project: { ...project, acceptedWarnings: [...kept, acceptance(project, found)] },
    };
  });
}

/** Takes back the acceptance of the warning with `key`: it is counted again. */
export function unacceptWarning(key: string): Command {
  return command({ action: 'unaccept-warning' }, (document) => {
    const { project } = document;
    const stored = project.acceptedWarnings ?? [];
    if (!stored.some((entry) => entry.problemKey === key)) return document;
    const kept = stored.filter((entry) => entry.problemKey !== key);
    const { acceptedWarnings: _, ...rest } = project;
    return { project: kept.length === 0 ? rest : { ...rest, acceptedWarnings: kept } };
  });
}
