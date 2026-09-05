import {
  type DocumentStore,
  deleteFeatures,
  renameFeature,
  setPartName,
  setPartQuantity,
  setShape,
} from '@leathercad/document';
import type { Feature, Part, Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { evaluate } from '@leathercad/domain';

import { NumberField } from './NumberField.js';
import { ShapeEditor } from './shapeEditors/index.js';

/**
 * Exact numeric editing for whatever is selected.
 *
 * The reason to build a leathercraft CAD tool rather than use a vector editor:
 * a panel is 105 mm because you typed 105, not because you dragged carefully.
 */
export function PropertyPanel({
  store,
  project,
  selected,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
}) {
  const found = findSelected(project, selected);

  if (found === null) {
    return (
      <aside className="panel" data-testid="property-panel">
        <h2>Properties</h2>
        <p className="panel-empty">
          {selected.size > 1
            ? `${selected.size} features selected. Editing more than one at a time comes later.`
            : 'Nothing selected. Draw with R, or pick something with V.'}
        </p>
      </aside>
    );
  }

  const { part, feature } = found;
  const source = feature.source;
  const resolved = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((entry) => entry.feature.id === feature.id);

  return (
    <aside className="panel" data-testid="property-panel">
      <h2>Properties</h2>

      <section className="panel-section">
        <div className="panel-heading">Part</div>
        <label className="field">
          <span className="field-label">Name</span>
          <span className="field-input">
            <input
              type="text"
              data-testid="part-name"
              value={part.name}
              onChange={(event) => store.dispatch(setPartName(part.id, event.target.value))}
            />
          </span>
        </label>
        <NumberField
          label="Cut"
          value={part.quantity}
          suffix="off"
          min={1}
          precision={0}
          onCommit={(value) => store.dispatch(setPartQuantity(part.id, value))}
        />
      </section>

      <section className="panel-section">
        <div className="panel-heading">{labelFor(feature)}</div>
        <label className="field">
          <span className="field-label">Name</span>
          <span className="field-input">
            <input
              type="text"
              value={feature.name}
              onChange={(event) => store.dispatch(renameFeature(feature.id, event.target.value))}
            />
          </span>
        </label>

        {source.kind === 'shape' ? (
          <ShapeEditor
            shape={source.shape}
            onChange={(shape) => store.dispatch(setShape(feature.id, shape))}
          />
        ) : (
          <p className="panel-empty">
            Freehand geometry has no parameters to edit yet — vertex editing is slice 3.9.
          </p>
        )}
      </section>

      {resolved?.ok === true && (
        <section className="panel-section">
          <div className="panel-heading">Measured</div>
          <div className="readout">
            <span>Perimeter</span>
            <b>{PathOps.length(resolved.path).toFixed(2)} mm</b>
          </div>
          <div className="readout">
            <span>Area</span>
            <b>{(PathOps.area(resolved.path) / 100).toFixed(2)} cm²</b>
          </div>
        </section>
      )}

      {resolved?.ok === false && (
        <section className="panel-section">
          <div className="panel-heading">Problem</div>
          <p className="panel-error">{resolved.error}</p>
        </section>
      )}

      <button
        type="button"
        className="tool danger"
        data-testid="delete-feature"
        onClick={() => {
          store.dispatch(deleteFeatures([feature.id]));
          store.clearSelection();
        }}
      >
        Delete
      </button>
    </aside>
  );
}

function findSelected(
  project: Project,
  selected: ReadonlySet<string>,
): { part: Part; feature: Feature } | null {
  if (selected.size !== 1) return null;
  const [id] = [...selected];
  for (const part of project.parts) {
    const feature = part.features.find((f) => f.id === id);
    if (feature !== undefined) return { part, feature };
  }
  return null;
}

function labelFor(feature: Feature): string {
  switch (feature.kind) {
    case 'cut-contour':
      return feature.role === 'outer' ? 'Cut line (outer)' : 'Cut line (inner)';
    case 'stitch-line':
      return 'Stitch line';
    case 'fold-line':
      return 'Fold line';
    case 'marking-line':
      return 'Marking line';
  }
}
