import type { ParametricShape } from '@leathercad/domain';

import { CircleEditor } from './CircleEditor.js';
import { RectEditor } from './RectEditor.js';

/**
 * Picks the editor for a parametric shape.
 *
 * One switch, in one small file, and the shape-specific fields live in their
 * own modules — so `PropertyPanel` does not need to know what a rectangle is,
 * and a new leathercraft shape is a new file rather than another branch in a
 * component that already does five other things.
 *
 * A switch rather than a `Record<type, Component>` lookup on purpose: the
 * switch narrows `shape` for free, so an editor cannot be handed the wrong
 * variant, and the `never` check below turns a missing editor into a **compile
 * error** rather than something noticed in review. When a new shape lands, the
 * build stops here until it has a panel.
 */
export function ShapeEditor({
  shape,
  onChange,
}: {
  shape: ParametricShape;
  onChange: (shape: ParametricShape) => void;
}) {
  switch (shape.type) {
    case 'rect':
      return <RectEditor shape={shape} onChange={onChange} />;
    case 'circle':
      return <CircleEditor shape={shape} onChange={onChange} />;
    default:
      return assertNever(shape);
  }
}

/**
 * Reached only if a `ParametricShape` variant has no case above — which the
 * compiler rejects, so this never runs. It exists to make that rejection
 * happen.
 */
function assertNever(shape: never): never {
  throw new Error(`No shape editor for ${JSON.stringify(shape)}`);
}
