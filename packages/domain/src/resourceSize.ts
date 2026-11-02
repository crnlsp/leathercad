import { checkResourceLimit } from '@leathercad/core';

import type { Project } from './feature.js';

/** Bound stored work before indexing, measuring paths or laying out text. No schema changes. */
export function checkProjectSize(project: Project): void {
  let features = project.parts.length + (project.guides?.length ?? 0);
  checkResourceLimit('features', features);
  let segments = 0;
  let characters = project.name.length;
  checkResourceLimit('characters', characters);
  for (const part of project.parts) {
    features += part.features.length;
    characters += part.name.length;
    checkResourceLimit('features', features);
    for (const feature of part.features) {
      characters += feature.name.length;
      if (feature.source.kind === 'path') segments += feature.source.path.segments.length;
      if (feature.source.kind === 'text') characters += feature.source.text.length;
    }
    checkResourceLimit('segments', segments);
    checkResourceLimit('characters', characters);
  }
}
