import { RESOURCE_LIMITS, ResourceLimitError } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Project } from './feature.js';
import { checkProjectSize } from './resourceSize.js';

function projectWithNames(projectName: string, partName: string, featureName: string): Project {
  return {
    id: 'project',
    name: projectName,
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part',
        name: partName,
        quantity: 1,
        features: [
          {
            id: 'feature',
            name: featureName,
            kind: 'marking-line',
            purpose: 'other',
            visible: true,
            locked: false,
            source: { kind: 'path', path: { closed: false, segments: [] } },
          },
        ],
      },
    ],
  };
}

describe('text prepared for drawing and paper (PERF-012)', () => {
  it('counts names as well as labels before any glyphs are made', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: RESOURCE_LIMITS.characters + 1, max: RESOURCE_LIMITS.characters + 100 }),
        fc.constantFrom('project', 'part', 'feature'),
        (length, where) => {
          const name = 'a'.repeat(length);
          const project = projectWithNames(
            where === 'project' ? name : '',
            where === 'part' ? name : '',
            where === 'feature' ? name : '',
          );
          expect(() => checkProjectSize(project)).toThrowError(ResourceLimitError);
        },
      ),
    );
  });

  it('bounds the aggregate even when every individual name fits', () => {
    const name = 'a'.repeat(Math.floor(RESOURCE_LIMITS.characters / 3) + 1);
    expect(() => checkProjectSize(projectWithNames(name, name, name))).toThrowError(
      ResourceLimitError,
    );
  });
});
