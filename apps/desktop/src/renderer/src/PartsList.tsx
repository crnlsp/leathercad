import { type DocumentStore } from '@leathercad/document';
import { roleOf, type Project } from '@leathercad/domain';

/**
 * Every feature in the project, grouped by part.
 *
 * Clicking the canvas is fine for something you can see; this is for the ones
 * you cannot — hidden behind another part, or off screen.
 */
export function PartsList({
  store,
  project,
  selected,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
}) {
  if (project.parts.length === 0) {
    return (
      <aside className="panel" data-testid="parts-list">
        <h2>Parts</h2>
        <p className="panel-empty">No parts yet. Press R and drag to draw one.</p>
      </aside>
    );
  }

  return (
    <aside className="panel" data-testid="parts-list">
      <h2>Parts</h2>
      {project.parts.map((part) => (
        <section className="panel-section" key={part.id}>
          <div className="panel-heading">
            {part.name}
            {part.quantity > 1 && <span className="badge">×{part.quantity}</span>}
          </div>
          {part.features.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className={selected.has(feature.id) ? 'row selected' : 'row'}
              onClick={() => store.select([feature.id])}
            >
              <span className={`swatch role-${roleOf(feature)}`} />
              {feature.name}
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}
