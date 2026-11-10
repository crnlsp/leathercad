import { addSeam, setSeam, type DocumentStore } from '@leathercad/document';
import {
  evaluate,
  resolveSeam,
  seamVerdict,
  type Part,
  type Feature,
  type Project,
  type Seam,
  type SeamAnchor,
  type SeamSide,
} from '@leathercad/domain';

import type { Translate } from '../../shared/i18n.js';

/** Only explicitly selected hole sets start a seam; choosing a whole piece does not. */
export function sewableIds(project: Project, selected: ReadonlySet<string>): string[] {
  const features = project.parts.flatMap((p) => p.features).filter((f) => selected.has(f.id));
  return features.length >= 1 &&
    features.length <= 2 &&
    features.every((f) => f.kind === 'stitch-hole-set')
    ? features.map((f) => f.id)
    : [];
}

export function holeSets(project: Project): { part: Part; feature: Feature }[] {
  return project.parts.flatMap((part) =>
    part.features.filter((f) => f.kind === 'stitch-hole-set').map((feature) => ({ part, feature })),
  );
}

export function seamAnchors(project: Project, id: string): SeamAnchor[] {
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === id);
  if (entry?.ok !== true) return [];
  const corners = entry.anchors.flatMap((distance, i) => (distance === null ? [] : [i]));
  return entry.path.closed ? corners : ['start', ...corners, 'end'];
}

export function stretchChoices(project: Project, id: string) {
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === id);
  const anchors = seamAnchors(project, id);
  const stretches: SeamSide['stretch'][] = [];
  if (entry?.ok === true && entry.path.closed) stretches.push({ kind: 'whole' });
  anchors.forEach((fromAnchor, i) => {
    const toAnchor =
      anchors[i + 1] ?? (entry?.ok === true && entry.path.closed ? anchors[0] : undefined);
    if (toAnchor !== undefined) stretches.push({ kind: 'between', fromAnchor, toAnchor });
  });
  return stretches.map((stretch) => {
    const side = { holeSetId: id, stretch };
    const result = resolveSeam(project, { id: 'preview', a: side, b: side });
    return {
      stretch,
      lengthMm: result.ok ? result.a.lengthMm : null,
      count: result.ok ? result.a.holes.length : null,
    };
  });
}

export function defaultSide(project: Project, id: string): SeamSide {
  return {
    holeSetId: id,
    stretch: stretchChoices(project, id)[0]?.stretch ?? {
      kind: 'between',
      fromAnchor: 'start',
      toAnchor: 'end',
    },
  };
}

interface Draft {
  readonly seam: Seam;
  readonly editing: boolean;
}

/** Owns a preview transaction; any outside command, undo or reset cancels it. */
export class SeamWorkflow {
  private current: Draft | null = null;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  constructor(private store: DocumentStore) {
    this.unsubscribe = store.subscribe(() => {
      if (this.current !== null && !store.getState().inTransaction) {
        this.current = null;
        this.emit();
      }
    });
  }
  snapshot = (): Draft | null => this.current;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  open(seam: Seam, editing: boolean): void {
    this.cancel();
    const command = editing ? setSeam(seam) : addSeam(seam);
    const document = this.store.getState().document;
    this.store.begin(command.labelFor?.(document) ?? command.label);
    this.current = { seam, editing };
    this.store.preview(command);
    this.emit();
  }
  update(seam: Seam): void {
    if (this.current === null) return;
    this.current = { ...this.current, seam };
    this.store.preview(this.current.editing ? setSeam(seam) : addSeam(seam));
    this.emit();
  }
  commit(): void {
    if (this.current === null) return;
    if (!seamVerdict(this.store.getState().document.project, this.current.seam).ok) return;
    const draft = this.current;
    const command = draft.editing ? setSeam(draft.seam) : addSeam(draft.seam);
    const label = command.labelFor?.(this.store.committedDocument) ?? command.label;
    this.current = null;
    this.store.begin(label);
    this.current = draft;
    this.store.preview(command);
    this.store.commit();
    // An unchanged edit does not emit a document event.
    this.current = null;
    this.emit();
  }
  cancel(): void {
    if (this.current === null) return;
    this.current = null;
    this.store.rollback();
    this.emit();
  }
  dispose(): void {
    this.cancel();
    this.unsubscribe();
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export function seamStretchName(stretch: SeamSide['stretch'], t: Translate): string {
  if (stretch.kind === 'whole') return t('seams.allRound');
  const anchor = (value: SeamAnchor) =>
    typeof value === 'number' ? t('seams.corner', { number: value + 1 }) : t(`seams.${value}`);
  return stretch.kind === 'between'
    ? t('seams.between', { from: anchor(stretch.fromAnchor), to: anchor(stretch.toAnchor) })
    : t('seams.from', { anchor: anchor(stretch.anchor), direction: t(`seams.${stretch.toward}`) });
}
