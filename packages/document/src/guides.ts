import { EPS_ANGLE, approxEq, assertFinite, quantise } from '@leathercad/core';
import { Vec2Ops } from '@leathercad/geometry';
import type { Guide } from '@leathercad/domain';

import { command, type Command } from './document.js';

function stored(guide: Guide): Guide {
  Vec2Ops.assertFiniteVec(guide.origin, 'guide origin');
  return {
    ...guide,
    origin: { ...guide.origin, x: quantise(guide.origin.x), y: quantise(guide.origin.y) },
    angleRad: assertFinite(guide.angleRad, 'guide angle'),
  };
}

export function addGuide(guide: Guide): Command {
  const value = stored(guide);
  return command({ action: 'add-guide' }, (document) => {
    if (
      document.project.guides?.some((entry) => entry.id === guide.id) ||
      document.project.parts.some((part) =>
        part.features.some((feature) => feature.id === guide.id),
      )
    )
      return document;
    return {
      project: { ...document.project, guides: [...(document.project.guides ?? []), value] },
    };
  });
}

export function setGuide(guide: Guide): Command {
  const value = stored(guide);
  return command({ action: 'edit-guide' }, (document) => {
    const previous = document.project.guides?.find((entry) => entry.id === guide.id);
    if (
      previous === undefined ||
      (approxEq(previous.origin.x, value.origin.x) &&
        approxEq(previous.origin.y, value.origin.y) &&
        approxEq(previous.angleRad, value.angleRad, EPS_ANGLE))
    )
      return document;
    return {
      project: {
        ...document.project,
        guides: (document.project.guides ?? []).map((entry) =>
          entry.id === guide.id
            ? { ...entry, ...value, origin: { ...entry.origin, ...value.origin } }
            : entry,
        ),
      },
    };
  });
}

export function deleteGuide(id: string): Command {
  return command({ action: 'delete-guide' }, (document) => {
    const guides = document.project.guides ?? [];
    if (!guides.some((guide) => guide.id === id)) return document;
    return { project: { ...document.project, guides: guides.filter((guide) => guide.id !== id) } };
  });
}
