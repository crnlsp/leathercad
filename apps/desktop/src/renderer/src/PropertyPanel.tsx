import {
  type DocumentStore,
  addAllowance,
  addStitchHoles,
  addStitchLine,
  allowanceRefusal,
  flipFeatures,
  flipRefusal,
  foldMirrorRefusal,
  mirrorAcrossFold,
  mirrorAxisFor,
  mirrorFeatures,
  mirrorRefusal,
  renameFeature,
  setSource,
  setPartName,
  setPartQuantity,
} from '@leathercad/document';
import type { Diagnostic, Feature, Part, Project } from '@leathercad/domain';
import type { FlipAxis, MirrorDirection } from '@leathercad/document';
import { PathOps } from '@leathercad/geometry';
import { describeProblem, evaluate, followRefusal, lockRefusal } from '@leathercad/domain';

import { IRON_PRESETS } from './irons.js';
import { NumberField } from './NumberField.js';
import { ProblemRows } from './ProblemList.js';
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
  diagnostics,
  nextId,
  requestDelete,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
  /** The one diagnostic list, filtered here to what is selected (X7). */
  diagnostics: readonly Diagnostic[];
  nextId: () => string;
  /** Deletes at once, or asks about dependents first (ADR 0009). */
  requestDelete: (ids: readonly string[]) => void;
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
  const problems = diagnostics.filter((d) => d.featureId === feature.id);
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
        <div className="panel-heading">
          {labelFor(feature)}
          {isMirrored(feature) && (
            // So a selected counterpart never reads as an ordinary independent
            // feature. What it *is* belongs beside its name, not three fields
            // down.
            <span className="badge" data-testid="mirrored-badge">
              Mirrored
            </span>
          )}
          {feature.locked && (
            <span className="badge" data-testid="locked-badge">
              Locked
            </span>
          )}
        </div>
        {/*
          A `fieldset` rather than a `disabled` on each control: every field in
          here, and every field a later editor adds, is disabled by the fact of
          the lock rather than by remembering to ask. Without it the panel
          offers a width box on a locked outline, the user types 120, presses
          Enter, and nothing happens with nothing said (S7, X1).
        */}
        <fieldset className="field-group" disabled={feature.locked}>
          {feature.locked && (
            <p className="panel-note" data-testid="locked-note">
              Locked, so nothing here can be changed. Unlock it in the parts panel.
            </p>
          )}
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

          {feature.frozenFrom !== undefined && (
            <p className="panel-note" data-testid="frozen-note">
              Frozen from {feature.frozenFrom}: drawn geometry now, no longer following it.
            </p>
          )}

          {feature.source.kind === 'derived' && (
            <FollowsField store={store} project={project} feature={feature} />
          )}

          {feature.kind !== 'text-label' &&
            feature.source.kind === 'derived' &&
            feature.source.op.type === 'mirror' && (
              /*
                The relationship, stated rather than discovered. A maker who
                moves the original and watches the counterpart go the *other*
                way needs to know that before it happens, not after — the
                mirror line is fixed, which is what makes the pair
                predictable. The axis and glide themselves are never shown:
                "where it is" is said by dragging it.
              */
              <p className="panel-note" data-testid="mirror-note">
                {feature.source.op.axis.kind === 'fold' ? (
                  <>
                    Folded across {sourceNameOf(project, feature.source.op.axis.foldId)}. Move that
                    fold and this follows it; move {sourceNameOf(project, feature.source.sourceId)}{' '}
                    and this stays its mirror. It cannot be dragged on its own.
                  </>
                ) : (
                  <>
                    Reflected across a line fixed where this was made — it does not follow{' '}
                    {sourceNameOf(project, feature.source.sourceId)} about. Moving{' '}
                    {sourceNameOf(project, feature.source.sourceId)} moves this the opposite way,
                    and resizing it changes the gap between the two. Drag this piece to place the
                    pair.
                  </>
                )}
              </p>
            )}

          <FeatureEditor
            store={store}
            feature={feature}
            holes={resolved?.ok === true ? resolved.holes : undefined}
          />
        </fieldset>
      </section>

      {/*
        A label's path is the box its words occupy, which has a perimeter and
        an area that mean nothing to anyone. Measuring is for geometry.
      */}
      {resolved?.ok === true && feature.kind !== 'text-label' && (
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

      {problems.length > 0 && (
        <section className="panel-section" data-testid="feature-problems">
          <div className="panel-heading">{problems.length === 1 ? 'Problem' : 'Problems'}</div>
          <ProblemRows diagnostics={problems} project={project} showWhere={false} />
        </section>
      )}

      {/*
        Flipping the piece itself, about its own centre — it stays where it is
        and faces the other way, and nothing is linked afterwards. The mirror
        below is the other one: a counterpart that keeps following this piece.
      */}
      {/*
        Asked before the gesture is offered, from the same query the command
        checks, so a button that would do nothing says why instead (X1).
      */}
      <div className="toolbar">
        <FlipButton store={store} project={project} feature={feature} axis="horizontal" />
        <FlipButton store={store} project={project} feature={feature} axis="vertical" />
      </div>

      {/*
        Mirror is the other thing entirely: flip changes this piece, mirror
        makes a counterpart that stays matched to it (ADR 0012). Side by side
        because that is where the maker looks for both, and named differently
        because they are not variants of each other.
      */}
      <div className="toolbar">
        <MirrorButton
          store={store}
          project={project}
          feature={feature}
          axis="horizontal"
          nextId={nextId}
        />
        <MirrorButton
          store={store}
          project={project}
          feature={feature}
          axis="vertical"
          nextId={nextId}
        />
      </div>

      {/*
        On its own row: three buttons do not fit the panel's width, and a
        properties panel that scrolls sideways is a broken one. It earns the
        room — it is the only one of the three that makes a counterpart which
        keeps following something.
      */}
      <FoldMirrorButton
        store={store}
        project={project}
        part={part}
        feature={feature}
        nextId={nextId}
      />

      <DeriveActions
        store={store}
        project={project}
        part={part}
        feature={feature}
        nextId={nextId}
      />

      {/*
        Asked here too, and for the same reason as the flips: without it a
        locked feature with dependents opens the delete dialog, the user
        answers "delete them too", and nothing happens — a question asked
        about something that was never going to be allowed.
      */}
      <DeleteButton project={project} feature={feature} requestDelete={requestDelete} />
    </aside>
  );
}

/** Whether this feature is a mirrored counterpart of another. */
function isMirrored(feature: Feature): boolean {
  return (
    feature.kind !== 'text-label' &&
    feature.source.kind === 'derived' &&
    feature.source.op.type === 'mirror'
  );
}

/** What a feature follows, by name, for the sentence that explains a mirror. */
function sourceNameOf(project: Project, sourceId: string): string {
  const found = project.parts.flatMap((part) => part.features).find((f) => f.id === sourceId);
  return found?.name ?? 'its original';
}

/** A counterpart that stays matched, or saying why one cannot be made. */
function MirrorButton({
  store,
  project,
  feature,
  axis,
  nextId,
}: {
  store: DocumentStore;
  project: Project;
  feature: Feature;
  axis: MirrorDirection;
  nextId: () => string;
}) {
  const refusal = mirrorRefusal(project, [feature.id], axis);
  const horizontal = axis === 'horizontal';

  return (
    <button
      type="button"
      className="tool"
      data-testid={horizontal ? 'mirror-horizontal' : 'mirror-vertical'}
      disabled={refusal !== null}
      title={
        refusal === null
          ? `A counterpart ${horizontal ? 'to the right' : 'below'}, mirrored across this piece's ` +
            `${horizontal ? 'right' : 'bottom'} edge as it is now. It keeps following this piece's ` +
            'shape; the mirror line stays where it is put.'
          : describeProblem(refusal)
      }
      onClick={() => {
        const placement = mirrorAxisFor(project, [feature.id], axis);
        if (placement === null) return;
        const id = nextId();
        store.dispatch(mirrorFeatures([feature.id], [id], placement));
        store.select([id]);
      }}
    >
      {horizontal ? 'Mirror ↔' : 'Mirror ↕'}
    </button>
  );
}

/**
 * Folding a feature across a fold line — the symmetry that keeps working.
 *
 * Offered only when the part has **exactly one** fold line, and named after
 * it, because the fold is an explicit dependency and never a guess: a mirror
 * about the wrong crease is not visibly wrong until the leather is cut. With
 * several folds the maker has to say which, which is 4.8b's selection path
 * rather than this shortcut.
 */
function FoldMirrorButton({
  store,
  project,
  part,
  feature,
  nextId,
}: {
  store: DocumentStore;
  project: Project;
  part: Part;
  feature: Feature;
  nextId: () => string;
}) {
  const folds = part.features.filter((candidate) => candidate.kind === 'fold-line');
  if (folds.length !== 1) return null;

  const fold = folds[0]!;
  const refusal = foldMirrorRefusal(project, [feature.id], fold.id);

  return (
    <button
      type="button"
      className="tool"
      data-testid="mirror-across-fold"
      disabled={refusal !== null}
      title={
        refusal === null
          ? `A counterpart across ${fold.name}, which re-mirrors whenever that fold moves`
          : describeProblem(refusal)
      }
      onClick={() => {
        const id = nextId();
        store.dispatch(mirrorAcrossFold([feature.id], [id], fold.id));
        store.select([id]);
      }}
    >
      Mirror across fold
    </button>
  );
}

/** Removing the piece, or saying why it cannot be removed. */
function DeleteButton({
  project,
  feature,
  requestDelete,
}: {
  project: Project;
  feature: Feature;
  requestDelete: (ids: readonly string[]) => void;
}) {
  const refusal = lockRefusal(project, [feature.id]);

  return (
    <button
      type="button"
      className="tool danger"
      data-testid="delete-feature"
      disabled={refusal !== null}
      title={refusal === null ? undefined : describeProblem(refusal)}
      onClick={() => requestDelete([feature.id])}
    >
      Delete
    </button>
  );
}

/** Mirroring the piece about its own centre, or saying why it cannot be. */
function FlipButton({
  store,
  project,
  feature,
  axis,
}: {
  store: DocumentStore;
  project: Project;
  feature: Feature;
  axis: FlipAxis;
}) {
  const refusal = flipRefusal(project, [feature.id], axis);
  const horizontal = axis === 'horizontal';

  return (
    <button
      type="button"
      className="tool"
      data-testid={horizontal ? 'flip-horizontal' : 'flip-vertical'}
      disabled={refusal !== null}
      title={
        refusal === null
          ? `Mirror ${horizontal ? 'left to right' : 'top to bottom'}, about this piece's centre`
          : describeProblem(refusal)
      }
      onClick={() => store.dispatch(flipFeatures([feature.id], axis))}
    >
      {horizontal ? 'Flip ↔' : 'Flip ↕'}
    </button>
  );
}

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
  project,
  part,
  feature,
  nextId,
}: {
  store: DocumentStore;
  project: Project;
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
        title="A stitch line that follows this edge at a fixed margin, and keeps following it"
        onClick={() => {
          const id = nextId();
          // No inset given: the command reads the project's stitch margin, so
          // a project set up for 4 mm gets 4 mm (D7, X8).
          store.dispatch(addStitchLine(part.id, id, feature.id));
          store.select([id]);
        }}
      >
        Add stitch line
      </button>
    );
  }

  if (feature.kind === 'stitch-line') {
    return (
      <>
        <AllowanceButton
          store={store}
          part={part}
          feature={feature}
          project={project}
          nextId={nextId}
        />
        <button
          type="button"
          className="tool"
          data-testid="add-stitch-holes"
          title="Holes along this line, at the pitch of your iron"
          onClick={() => {
            const id = nextId();
            store.dispatch(
              // Likewise the iron: the pitch comes from the project's settings,
              // and the label follows the pitch so the panel can still name the
              // iron rather than calling every default "Custom".
              addStitchHoles(part.id, id, feature.id, {
                mode: 'fit-whole',
                corners: 'hole-at-corner',
                ...ironLabelFor(store.getState().document.project.settings.defaultIronPitchMm),
              }),
            );
            store.select([id]);
          }}
        >
          Add holes
        </button>
      </>
    );
  }

  return null;
}

/**
 * Growing the cut edge outward from the stitching that defines it.
 *
 * Offered beside *Add holes* because it is the other thing a maker does to a
 * stitch line, and because drawing the stitching first and deciding on the
 * edge after is the common order — not every pocket starts life in *Stitch +
 * allowance* mode. It builds the identical derivation that mode does.
 */
function AllowanceButton({
  store,
  project,
  part,
  feature,
  nextId,
}: {
  store: DocumentStore;
  project: Project;
  part: Part;
  feature: Feature;
  nextId: () => string;
}) {
  const refusal = allowanceRefusal(project, feature.id);

  return (
    <button
      type="button"
      className="tool"
      data-testid="add-allowance"
      disabled={refusal !== null}
      title={
        refusal === null
          ? "The cut edge, that far outside this seam — and it follows the seam's shape"
          : describeProblem(refusal)
      }
      onClick={() => {
        const id = nextId();
        store.dispatch(addAllowance(part.id, id, feature.id));
        store.select([id]);
      }}
    >
      Add seam allowance
    </button>
  );
}

/** The name of an iron with this pitch, if the presets know one. */
function ironLabelFor(pitchMm: number): { ironLabel?: string } {
  const iron = IRON_PRESETS.find((preset) => preset.pitchMm === pitchMm);
  return iron === undefined ? {} : { ironLabel: iron.label };
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
    case 'text-label':
      return 'Text label';
  }
}

/**
 * Which feature a derived feature follows, and what it could follow instead.
 *
 * Re-pointing is how a relationship survives replacing its source (ADR 0009).
 * Only sources the graph would accept are offered — the same `followRefusal`
 * the command enforces — so the list never promises what the command refuses.
 */
function FollowsField({
  store,
  project,
  feature,
}: {
  store: DocumentStore;
  project: Project;
  feature: Feature;
}) {
  if (feature.source.kind !== 'derived') return null;
  const current = feature.source.sourceId;

  const options = project.parts.flatMap((part) =>
    part.features
      .filter(
        (candidate) =>
          candidate.id === current ||
          (candidate.id !== feature.id &&
            followRefusal(project, feature.id, candidate.id) === null),
      )
      .map((candidate) => ({ id: candidate.id, label: `${part.name} › ${candidate.name}` })),
  );

  // Named for the relationship it actually is. "Follows" is right for a stitch
  // line inset from an outline; a counterpart is mirrored *from* its original,
  // and the word is what tells the maker which of the two they are looking at.
  const mirrored = isMirrored(feature);

  return (
    <label className="field">
      <span className="field-label">{mirrored ? 'Mirrored from' : 'Follows'}</span>
      <select
        data-testid="follows"
        value={current}
        onChange={(event) => store.dispatch(setSource(feature.id, event.target.value))}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
