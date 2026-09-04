import {
  type DocumentStore,
  deleteFeatures,
  renameFeature,
  setPartName,
  setPartQuantity,
  setShape,
} from '@leathercad/document';
import type { CornerRadii } from '@leathercad/geometry';
import type { Feature, Part, ParametricShape, Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { evaluate } from '@leathercad/domain';

import { NumberField } from './NumberField.js';

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

        {source.kind === 'shape' && source.shape.type === 'rect' ? (
          <RectFields
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

function RectFields({
  shape,
  onChange,
}: {
  shape: Extract<ParametricShape, { type: 'rect' }>;
  onChange: (shape: ParametricShape) => void;
}) {
  const setRadius = (corner: keyof CornerRadii, value: number): void => {
    onChange({ ...shape, radii: { ...shape.radii, [corner]: value } });
  };

  return (
    <>
      <div className="field-pair">
        <NumberField
          label="X"
          value={shape.origin.x}
          onCommit={(x) => onChange({ ...shape, origin: { ...shape.origin, x } })}
        />
        <NumberField
          label="Y"
          value={shape.origin.y}
          onCommit={(y) => onChange({ ...shape, origin: { ...shape.origin, y } })}
        />
      </div>
      <div className="field-pair">
        <NumberField
          label="Width"
          value={shape.width}
          min={0.01}
          onCommit={(width) => onChange({ ...shape, width })}
        />
        <NumberField
          label="Height"
          value={shape.height}
          min={0.01}
          onCommit={(height) => onChange({ ...shape, height })}
        />
      </div>

      <div className="panel-heading small">Corner radii</div>
      {/* Laid out to match the corners on screen: top row above, bottom below. */}
      <div className="field-pair">
        <NumberField
          label="↖"
          value={shape.radii.topLeft}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('topLeft', v)}
        />
        <NumberField
          label="↗"
          value={shape.radii.topRight}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('topRight', v)}
        />
      </div>
      <div className="field-pair">
        <NumberField
          label="↙"
          value={shape.radii.bottomLeft}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('bottomLeft', v)}
        />
        <NumberField
          label="↘"
          value={shape.radii.bottomRight}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('bottomRight', v)}
        />
      </div>
    </>
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
