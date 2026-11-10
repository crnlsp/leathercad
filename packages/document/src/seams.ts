import {
  seamChangeRefusal,
  seamStructureProblems,
  type Seam,
  type SeamSide,
} from '@leathercad/domain';

import { command, type Command } from './document.js';

export function addSeam(seam: Seam): Command {
  return namedSeamCommand(seam, 'add-seam', (document) => {
    const project = { ...document.project, seams: [...(document.project.seams ?? []), seam] };
    return seamStructureProblems(project).length === 0 ? { ...document, project } : document;
  });
}

/** Replace only a known seam, retaining fields a newer writer may have added. */
export function setSeam(seam: Seam): Command {
  return namedSeamCommand(seam, 'edit-seam', (document) => {
    const old = document.project.seams?.find((s) => s.id === seam.id);
    if (old === undefined) return document;
    const side = (before: SeamSide, after: SeamSide): SeamSide => ({
      ...before,
      ...after,
      stretch: {
        ...Object.fromEntries(
          Object.entries(before.stretch).filter(
            ([key]) => !['kind', 'anchor', 'toward', 'fromAnchor', 'toAnchor'].includes(key),
          ),
        ),
        ...after.stretch,
      },
    });
    const next = { ...old, ...seam, a: side(old.a, seam.a), b: side(old.b, seam.b) };
    if (JSON.stringify(old) === JSON.stringify(next)) return document;
    const project = {
      ...document.project,
      seams: (document.project.seams ?? []).map((s) => (s.id === seam.id ? next : s)),
    };
    return seamChangeRefusal(document.project, project) === null
      ? { ...document, project }
      : document;
  });
}

export function removeSeam(id: string): Command {
  return command({ action: 'remove-seam' }, (document) => {
    const seams = document.project.seams;
    if (!seams?.some((s) => s.id === id)) return document;
    return {
      ...document,
      project: { ...document.project, seams: seams.filter((s) => s.id !== id) },
    };
  });
}

function namedSeamCommand(
  seam: Seam,
  action: 'add-seam' | 'edit-seam',
  apply: Command['apply'],
): Command {
  return {
    ...command({ action }, apply),
    labelFor: (document) => {
      const name = (side: SeamSide) =>
        document.project.parts.find((p) => p.features.some((f) => f.id === side.holeSetId))?.name ??
        '';
      return { action, name: name(seam.a), otherName: name(seam.b) };
    },
  };
}
