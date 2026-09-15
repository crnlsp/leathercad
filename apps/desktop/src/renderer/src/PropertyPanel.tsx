import {
  type DocumentStore,
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  renameFeature,
  setPartName,
  setPartQuantity,
} from '@leathercad/document';
import type { Feature, Part, Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { evaluate } from '@leathercad/domain';

import { NumberField } from './NumberField.js';
import { FeatureEditor } from './featureEditors/index.js';

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
  nextId,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
  nextId: () => string;
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

        <FeatureEditor
          store={store}
          feature={feature}
          holes={resolved?.ok === true ? resolved.holes : undefined}
        />
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

      <DeriveActions store={store} part={part} feature={feature} nextId={nextId} />

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

/** The inset most leatherwork uses, and the one the settings default to. */
const DEFAULT_STITCH_INSET_MM = 3.5;

/**
 * What can be derived from what is selected.
 *
 * Actions, not modes: each one fires once and finishes, so by the tool
 * palette's own rule they belong here in the selection scope rather than in
 * the mode rail. They appear only where they mean something — you cannot put
 * holes on an outline, only on the stitch line that follows it.
 */
function DeriveActions({
  store,
  part,
  feature,
  nextId,
}: {
  store: DocumentStore;
  part: Part;
  feature: Feature;
  nextId: () => string;
}) {
  if (feature.kind === 'cut-contour') {
    return (
      <button
        type="button"
        className="tool"
        data-testid="add-stitch-line"
        title="A stitch line that follows this outline, and keeps following it"
        onClick={() => {
          const id = nextId();
          store.dispatch(addStitchLine(part.id, id, feature.id, DEFAULT_STITCH_INSET_MM));
          store.select([id]);
        }}
      >
        Add stitch line
      </button>
    );
  }

  if (feature.kind === 'stitch-line') {
    return (
      <button
        type="button"
        className="tool"
        data-testid="add-stitch-holes"
        title="Holes along this line, at the pitch of your iron"
        onClick={() => {
          const id = nextId();
          store.dispatch(
            addStitchHoles(part.id, id, feature.id, {
              type: 'stitch-holes',
              pitchMm: 3.85,
              mode: 'fit-whole',
              corners: 'hole-at-corner',
              ironLabel: 'KS Blade 3.85 mm',
            }),
          );
          store.select([id]);
        }}
      >
        Add holes
      </button>
    );
  }

  return null;
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
    case 'stitch-hole-set':
      return 'Stitch holes';
    case 'hardware-hole':
      return 'Hardware hole';
  }
}
