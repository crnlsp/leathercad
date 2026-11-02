import { DEFAULT_SETTINGS, evaluate, type Project } from '@leathercad/domain';
import { expect, it } from 'vitest';
import { buildExportScene } from './scene.js';

it('construction guides never affect exported paths, captions, bounds or sheet layout', () => {
  const project: Project = {
    id: 'p',
    name: 'Panel',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part',
        name: 'Panel',
        quantity: 1,
        features: [
          {
            id: 'outline',
            name: 'Outline',
            kind: 'cut-contour',
            role: 'outer',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: { type: 'circle', centre: { x: 0, y: 0 }, radius: 20 },
            },
          },
        ],
      },
    ],
  };
  const scene = buildExportScene(evaluate(project), project.name);
  expect(
    buildExportScene(
      evaluate({
        ...project,
        guides: [{ id: 'g', origin: { x: 10000, y: -10000 }, angleRad: Math.PI / 4 }],
      }),
      project.name,
    ),
  ).toEqual(scene);
});
