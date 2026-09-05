import { setDerivation } from '@leathercad/document';
import type { DocumentStore } from '@leathercad/document';
import type { Derivation, Feature, StitchHoles } from '@leathercad/domain';

import { ShapeEditor } from '../shapeEditors/index.js';
import { setShape } from '@leathercad/document';
import { StitchHoleSetEditor } from './StitchHoleSetEditor.js';
import { StitchLineEditor } from './StitchLineEditor.js';

/**
 * The parameters of whatever is selected.
 *
 * Dispatches on where the geometry *comes from*, because that is what decides
 * which numbers exist. A shape has dimensions; a derived feature has the
 * relationship that produced it — an inset, a pitch — and no coordinates of
 * its own, because it does not have any.
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

  if (source.kind === 'shape') {
    return (
      <ShapeEditor
        shape={source.shape}
        onChange={(shape) => store.dispatch(setShape(feature.id, shape))}
      />
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

  return (
    <p className="panel-empty">
      Freehand geometry has no parameters to edit yet — vertex editing is slice 3.9.
    </p>
  );
}
