import {
  setDerivation,
  setFoldDirection,
  setFoldThickness,
  setHardwareType,
  setMarkingPurpose,
  setShape,
} from '@leathercad/document';
import type { DocumentStore } from '@leathercad/document';
import type { Derivation, Feature, StitchHoles } from '@leathercad/domain';
import type { JSX } from 'react';

import { ShapeEditor } from '../shapeEditors/index.js';
import { FoldLineEditor } from './FoldLineEditor.js';
import { HardwareHoleEditor } from './HardwareHoleEditor.js';
import { MarkingLineEditor } from './MarkingLineEditor.js';
import { StitchHoleSetEditor } from './StitchHoleSetEditor.js';
import { StitchLineEditor } from './StitchLineEditor.js';

/**
 * The parameters of whatever is selected.
 *
 * Two questions, asked in order. **What is it** — a fold has a direction, a
 * marking line a purpose, a hole a piece of hardware it is for; these belong to
 * the feature whatever its geometry happens to be. Then **where does its
 * geometry come from** — a shape has dimensions, a derived feature has the
 * relationship that produced it and no coordinates of its own.
 *
 * Keeping them separate is what lets a fold line drawn freehand still have an
 * editable direction, and a hardware hole get its centre and diameter from
 * `CircleEditor` without restating them.
 */
export function FeatureEditor({
  store,
  feature,
  holes,
}: {
  store: DocumentStore;
  feature: Feature;
  holes: StitchHoles | undefined;
}) {
  const source = feature.source;
  const own = ownParameters(store, feature);

  if (source.kind === 'shape') {
    return (
      <>
        {own}
        <ShapeEditor
          shape={source.shape}
          onChange={(shape) => store.dispatch(setShape(feature.id, shape))}
        />
      </>
    );
  }

  if (source.kind === 'derived') {
    const change = (op: Derivation): void => {
      store.dispatch(setDerivation(feature.id, op));
    };

    switch (source.op.type) {
      case 'offset':
        return <StitchLineEditor op={source.op} onChange={change} />;
      case 'stitch-holes':
        return <StitchHoleSetEditor op={source.op} holes={holes} onChange={change} />;
    }
  }

  if (own !== null) return own;

  return (
    <p className="panel-empty">
      Freehand geometry has no parameters to edit yet — vertex editing is slice 3.9.
    </p>
  );
}

/** The fields belonging to the feature itself, or null if it has none. */
function ownParameters(store: DocumentStore, feature: Feature): JSX.Element | null {
  switch (feature.kind) {
    case 'fold-line':
      return (
        <FoldLineEditor
          feature={feature}
          onDirection={(direction) => store.dispatch(setFoldDirection(feature.id, direction))}
          onThickness={(mm) => store.dispatch(setFoldThickness(feature.id, mm))}
        />
      );
    case 'marking-line':
      return (
        <MarkingLineEditor
          feature={feature}
          onChange={(next) => store.dispatch(setMarkingPurpose(feature.id, next.purpose))}
        />
      );
    case 'hardware-hole':
      return (
        <HardwareHoleEditor
          feature={feature}
          onChange={(next) => store.dispatch(setHardwareType(feature.id, next.hardwareType))}
        />
      );
    default:
      return null;
  }
}
