import { seamStructureProblems, type Seam } from '@leathercad/domain';

import { command, type Command } from './document.js';

/** Add manufacturing metadata in one step; Sew together is introduced in 9.6b. */
export function addSeam(seam: Seam): Command {
  return command({ action: 'add-seam' }, (document) => {
    const project = { ...document.project, seams: [...(document.project.seams ?? []), seam] };
    return seamStructureProblems(project).length === 0 ? { ...document, project } : document;
  });
}
