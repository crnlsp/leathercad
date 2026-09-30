import { formatMm, formatNumber } from '@leathercad/core';
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
import { evaluate, followRefusal, lockRefusal, type ResolvedFeature } from '@leathercad/domain';

import type { Translate } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { IRON_PRESETS } from './irons.js';
import { NumberField } from './NumberField.js';
import { ProblemRows } from './ProblemList.js';
import { ReasonedButton, ReasonedRow, type ReasonedButtonProps } from './ReasonedButton.js';
import { FeatureEditor } from './featureEditors/index.js';
import { MarkOf } from './icons/marks.js';

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
  const { t } = useI18n();
  const found = findSelected(project, selected);

  if (found === null) {
    return (
      <aside
        className="panel properties"
        data-testid="property-panel"
        aria-label={t('properties.title')}
      >
        <header className="panel-header">
          <h2>{t('properties.title')}</h2>
        </header>
        <p className="panel-empty">
          {selected.size > 1
            ? t('properties.manySelected', { count: selected.size })
            : t('properties.nothingSelected')}
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
    <aside
      className="panel properties"
      data-testid="property-panel"
      aria-label={t('properties.title')}
    >
      {/*
        What is selected stays in view however far the fields scroll: its mark,
        its name and what it is (UI Foundations §7.1) — named by the same mark
        the parts tree uses (F.6).
      */}
      <header className="panel-header" data-testid="property-header">
        <MarkOf feature={feature} />
        <h2 className="header-name">{feature.name}</h2>
        {isMirrored(feature) && (
          // So a selected counterpart never reads as an ordinary independent
          // feature. What it *is* belongs beside its name, not three fields
          // down.
          <span className="badge" data-testid="mirrored-badge">
            {t('properties.mirrors')}
          </span>
        )}
        {feature.locked && (
          <span className="badge" data-testid="locked-badge">
            {t('properties.locked')}
          </span>
        )}
      </header>

      <section className="panel-section">
        <div className="panel-heading">{t('properties.part')}</div>
        <label className="field">
          <span className="field-label">{t('properties.name')}</span>
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
          label={t('properties.cut')}
          value={part.quantity}
          suffix={t('properties.cutSuffix')}
          min={1}
          precision={0}
          onCommit={(value) => store.dispatch(setPartQuantity(part.id, value))}
        />
      </section>

      <section className="panel-section">
        <div className="panel-heading">{t(`featureKind.${kindOf(feature)}`)}</div>
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
              {t('properties.lockedNote')}
            </p>
          )}
          <label className="field">
            <span className="field-label">{t('properties.name')}</span>
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
              {t('properties.frozenNote', { source: feature.frozenFrom })}
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
                {/* One word per relationship (F.1): Mirrors, and Mirrors … across. */}
                {feature.source.op.axis.kind === 'fold'
                  ? t('properties.mirrorFoldNote', {
                      source: sourceNameOf(project, feature.source.sourceId, t),
                      fold: sourceNameOf(project, feature.source.op.axis.foldId, t),
                    })
                  : t('properties.mirrorLineNote', {
                      source: sourceNameOf(project, feature.source.sourceId, t),
                    })}
              </p>
            )}

          <FeatureEditor
            store={store}
            feature={feature}
            holes={resolved?.ok === true ? resolved.holes : undefined}
          />
        </fieldset>
      </section>

      {resolved?.ok === true && (
        <Measured project={project} feature={feature} resolved={resolved} />
      )}

      {problems.length > 0 && (
        <section className="panel-section" data-testid="feature-problems">
          <div className="panel-heading">
            {t('properties.problems', { count: problems.length })}
          </div>
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
      <section className="panel-section">
        <div className="panel-heading small">{t('properties.flipHeading')}</div>
        <ReasonedRow
          buttons={[
            flipButton(store, project, feature, 'horizontal', t),
            flipButton(store, project, feature, 'vertical', t),
          ]}
        />
      </section>

      {/*
        Mirror is the other thing entirely: flip changes this piece, mirror
        makes a counterpart that stays matched to it (ADR 0012). Side by side
        because that is where the maker looks for both, and named differently
        because they are not variants of each other.
      */}
      <section className="panel-section">
        <div className="panel-heading small">{t('properties.mirrorHeading')}</div>
        <ReasonedRow
          buttons={[
            mirrorButton(store, project, feature, 'horizontal', nextId, t),
            mirrorButton(store, project, feature, 'vertical', nextId, t),
          ]}
        />
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
      </section>

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
function sourceNameOf(project: Project, sourceId: string, t: Translate): string {
  const found = project.parts.flatMap((part) => part.features).find((f) => f.id === sourceId);
  return found?.name ?? t('properties.itsOriginal');
}

/** A counterpart that stays matched, or saying why one cannot be made. */
function mirrorButton(
  store: DocumentStore,
  project: Project,
  feature: Feature,
  axis: MirrorDirection,
  nextId: () => string,
  t: Translate,
): ReasonedButtonProps {
  const horizontal = axis === 'horizontal';
  // An outline is the piece itself: its counterpart is a second piece, so it
  // goes into a part of its own (a piece of leather has one edge).
  const wholePiece = feature.kind === 'cut-contour' && feature.role === 'outer';
  return {
    testId: horizontal ? 'mirror-horizontal' : 'mirror-vertical',
    reason: mirrorRefusal(project, [feature.id], axis),
    hint: t(`properties.mirrorHint.${wholePiece ? 'piece' : 'counterpart'}.${axis}`),
    onClick: () => {
      const placement = mirrorAxisFor(project, [feature.id], axis);
      if (placement === null) return;
      const id = nextId();
      store.dispatch(mirrorFeatures([feature.id], [id], placement, [nextId()]));
      store.select([id]);
    },
    children: t(`properties.mirror.${axis}`),
  };
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
  const { t } = useI18n();
  const folds = part.features.filter((candidate) => candidate.kind === 'fold-line');
  if (folds.length !== 1) return null;

  const fold = folds[0]!;

  return (
    <ReasonedButton
      testId="mirror-across-fold"
      reason={foldMirrorRefusal(project, [feature.id], fold.id)}
      hint={t('properties.foldMirrorHint', { fold: fold.name })}
      onClick={() => {
        const id = nextId();
        store.dispatch(mirrorAcrossFold([feature.id], [id], fold.id));
        store.select([id]);
      }}
    >
      {t('properties.foldMirror')}
    </ReasonedButton>
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
  const { t } = useI18n();
  return (
    <ReasonedButton
      testId="delete-feature"
      variant="destructive"
      reason={lockRefusal(project, [feature.id])}
      onClick={() => requestDelete([feature.id])}
    >
      {t('actions.delete')}
    </ReasonedButton>
  );
}

/** Mirroring the piece about its own centre, or saying why it cannot be. */
function flipButton(
  store: DocumentStore,
  project: Project,
  feature: Feature,
  axis: FlipAxis,
  t: Translate,
): ReasonedButtonProps {
  return {
    testId: axis === 'horizontal' ? 'flip-horizontal' : 'flip-vertical',
    reason: flipRefusal(project, [feature.id], axis),
    hint: t(`properties.flipHint.${axis}`),
    onClick: () => store.dispatch(flipFeatures([feature.id], axis)),
    children: t(`properties.flip.${axis}`),
  };
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
  const { t } = useI18n();
  if (feature.kind === 'cut-contour') {
    return (
      <ReasonedButton
        testId="add-stitch-line"
        reason={null}
        hint={t('properties.addStitchLineHint')}
        onClick={() => {
          const id = nextId();
          // No inset given: the command reads the project's stitch margin, so
          // a project set up for 4 mm gets 4 mm (D7, X8).
          store.dispatch(addStitchLine(part.id, id, feature.id));
          store.select([id]);
        }}
      >
        {t('properties.addStitchLine')}
      </ReasonedButton>
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
        <ReasonedButton
          testId="add-stitch-holes"
          reason={null}
          hint={t('properties.addHolesHint')}
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
          {t('properties.addHoles')}
        </ReasonedButton>
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
  const { t } = useI18n();
  return (
    <ReasonedButton
      testId="add-allowance"
      reason={allowanceRefusal(project, feature.id)}
      hint={t('properties.addAllowanceHint')}
      onClick={() => {
        const id = nextId();
        store.dispatch(addAllowance(part.id, id, feature.id));
        store.select([id]);
      }}
    >
      {t('properties.addAllowance')}
    </ReasonedButton>
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

/**
 * What a feature is, for its heading: in the maker's words, the ones the
 * drawing modes already use — not the model's "cut line (outer)" beside a
 * feature named "Outline" (F.1). A cut contour is two things to a maker.
 */
function kindOf(feature: Feature): Exclude<Feature['kind'], 'cut-contour'> | 'outline' | 'cut-out' {
  if (feature.kind !== 'cut-contour') return feature.kind;
  return feature.role === 'outer' ? 'outline' : 'cut-out';
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
  const { t } = useI18n();
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

  // Named for the relationship it actually is, one word each (F.1): a stitch
  // line Follows its outline; a counterpart Mirrors its original.
  const mirrored = isMirrored(feature);

  return (
    <label className="field">
      <span className="field-label">
        {mirrored ? t('properties.mirrors') : t('properties.follows')}
      </span>
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

/**
 * What there is to measure on this feature, and nothing that means nothing.
 *
 * A perimeter and an area are facts about a closed shape. A line has a length
 * and no area; a stitch line's length is its thread run; a hole's size is its
 * diameter, already in its editor; a hole set's numbers are its count and
 * spacing; and a label's path is only the box its words occupy (F.1, audit
 * §3.6). A dimension's value is read from the same laid-out label the canvas
 * draws and the PDF prints, so the three cannot disagree.
 */
function Measured({
  project,
  feature,
  resolved,
}: {
  project: Project;
  feature: Feature;
  resolved: Extract<ResolvedFeature, { ok: true }>;
}) {
  const { t } = useI18n();
  if (
    feature.kind === 'text-label' ||
    feature.kind === 'hardware-hole' ||
    feature.kind === 'stitch-hole-set'
  ) {
    return null;
  }

  if (feature.kind === 'measurement') {
    const source = feature.source;
    const names = [
      ...new Set(
        source.kind === 'measurement'
          ? [source.a.featureId, source.b.featureId].map((id) => sourceNameOf(project, id, t))
          : [],
      ),
    ];
    return (
      <section className="panel-section">
        <div className="readout key">
          <span>{t('properties.reads')}</span>
          <b data-testid="dimension-value">
            {resolved.text === undefined ? '—' : `${resolved.text.layout.text} mm`}
          </b>
        </div>
        <div className="readout">
          <span>{t('properties.measures')}</span>
          <b className="readout-words">{names.join(' · ')}</b>
        </div>
      </section>
    );
  }

  const length = <b data-testid="measured-length">{formatMm(PathOps.length(resolved.path))}</b>;
  if (!resolved.path.closed || feature.kind === 'stitch-line') {
    return (
      <section className="panel-section">
        <div className="panel-heading">{t('properties.measured')}</div>
        <div className="readout">
          <span>{t('properties.length')}</span>
          {length}
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section">
      <div className="panel-heading">{t('properties.measured')}</div>
      <div className="readout">
        <span>{t('properties.perimeter')}</span>
        {length}
      </div>
      <div className="readout">
        <span>{t('properties.area')}</span>
        <b>{formatNumber(PathOps.area(resolved.path) / 100, 2)} cm²</b>
      </div>
    </section>
  );
}
