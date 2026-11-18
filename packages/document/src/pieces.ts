import { approxEq, EPS_ANGLE, quantise, type Mm } from '@leathercad/core';
import {
  evaluate,
  isHolesAlongALine,
  referencesOf,
  type Feature,
  type FeatureId,
  type MirrorAxis,
  type Part,
  type PartId,
  type Project,
  type ResolvedFeature,
  type Seam,
  type SeamId,
} from '@leathercad/domain';
import { Vec2Ops, type Path, type Vec2 } from '@leathercad/geometry';

import {
  boxOfParts,
  cutOut,
  drawnStitchLine,
  foldLine,
  markingLine,
  moveClear,
  movePieces,
  pathPart,
  relock,
  repointed,
} from './commands.js';
import { command, type Command } from './document.js';

/**
 * Whole pieces lifted out of a project (8.8b): their parts as stored, and the
 * seams sewn between them. Nothing in them points outside them, so they paste
 * into any project — the one they came from, or another tab's.
 */
export interface CopiedPieces {
  readonly parts: readonly Part[];
  readonly seams: readonly Seam[];
}

/** A feature a copy could not take as it was, by name: what the maker is told. */
export interface CopyLoss {
  readonly featureName: string;
  readonly partName: string;
}

export interface PiecesCopy {
  readonly pieces: CopiedPieces;
  /** Follows a piece left behind, so copied as the geometry it draws now. */
  readonly frozen: readonly CopyLoss[];
  /** Points at a piece left behind and has no drawn form to keep: left out. */
  readonly dropped: readonly CopyLoss[];
}

/** Fresh ids for a paste, in the copy's order: its parts, its features, its seams. */
export interface PasteIds {
  readonly parts: readonly PartId[];
  readonly features: readonly FeatureId[];
  readonly seams: readonly SeamId[];
}

/**
 * Copies whole pieces, resolving every reference that leaves them — so a copy
 * never dangles, wherever it is pasted.
 *
 * A reference out of the pieces is resolved the way deleting what it points at
 * would resolve it (`freeze`), because the paste will not have it either:
 *
 * - a feature that **follows** a piece left behind — a mirrored piece's
 *   outline and stitch line, without the piece they mirror — is kept as the
 *   geometry it draws now, and says what it was frozen from;
 * - a mirrored **hole set** has no drawn form to freeze to, so it follows the
 *   copy's own stitch line instead, made as its original's holes were made
 *   along the original's: the same holes, since a mirror moves a line and its
 *   holes alike;
 * - a **dimension** to a piece left behind measures nothing, and goes.
 *
 * Seams go with the pieces when both their hole sets do. Pure: read from the
 * project, which is not changed.
 */
export function copyPieces(project: Project, partIds: Iterable<PartId>): PiecesCopy {
  const wanted = new Set(partIds);
  const parts = project.parts.filter((part) => wanted.has(part.id));
  const original = new Map(allFeatures(project.parts).map((f) => [f.id, f] as const));
  const partNameOf = new Map(
    parts.flatMap((part) => part.features.map((f) => [f.id, part.name] as const)),
  );
  const kept = new Map(allFeatures(parts).map((f) => [f.id, f] as const));

  let resolved: ReadonlyMap<FeatureId, ResolvedFeature> | null = null;
  const evaluated = (id: FeatureId): ResolvedFeature | undefined => {
    resolved ??= new Map(
      evaluate(project)
        .parts.flatMap((part) => part.features)
        .map((entry) => [entry.feature.id, entry] as const),
    );
    return resolved.get(id);
  };

  const frozen: CopyLoss[] = [];
  const dropped: CopyLoss[] = [];
  const loss = (feature: Feature): CopyLoss => ({
    featureName: feature.name,
    partName: partNameOf.get(feature.id) ?? '',
  });

  // Until nothing points out: a feature re-rooted onto one that is later
  // dropped is resolved again, and each feature can change only so often.
  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of kept.values()) {
      if (referencesOf(feature).every((ref) => kept.has(ref))) continue;
      changed = true;

      const rerooted = rerootedMirror(feature, original, kept);
      if (rerooted !== null) {
        kept.set(feature.id, rerooted);
        continue;
      }
      const entry = evaluated(feature.id);
      if (
        feature.source.kind === 'derived' &&
        feature.kind !== 'text-label' &&
        feature.kind !== 'measurement' &&
        !isHolesAlongALine(feature.kind) &&
        entry?.ok === true
      ) {
        kept.set(feature.id, {
          ...feature,
          source: { kind: 'path', path: entry.path },
          frozenFrom: original.get(feature.source.sourceId)?.name ?? feature.name,
        });
        frozen.push(loss(feature));
        continue;
      }
      kept.delete(feature.id);
      dropped.push(loss(feature));
    }
  }

  return {
    pieces: {
      parts: parts.map((part) => ({
        ...part,
        features: part.features.flatMap((f) => {
          const copy = kept.get(f.id);
          return copy === undefined ? [] : [copy];
        }),
      })),
      seams: (project.seams ?? []).filter(
        (seam) => kept.has(seam.a.holeSetId) && kept.has(seam.b.holeSetId),
      ),
    },
    frozen,
    dropped,
  };
}

/**
 * Pastes copied pieces with fresh ids, every reference among them re-pointed
 * to the pasted copies (8.8b).
 *
 * Centred on `at` when the maker pasted at a point on the board — moved by a
 * whole number of quanta, so a typed position stays typed — and otherwise
 * clear of everything, as *Duplicate* places a copy. Names, quantities, locks
 * and hidden features come as they were. One step of undo.
 *
 * The ids are given rather than made, so the command stays a pure description
 * of an edit; too few, or a copy of no pieces, refuses and changes nothing. A
 * copy that draws nothing has no centre, and lands where it was. A point that
 * is not finite is refused at once, with a `RangeError` naming it.
 */
export function pastePieces(
  pieces: CopiedPieces,
  ids: PasteIds,
  at: Vec2 | null,
  stepMm: Vec2 | null = null,
): Command {
  if (at !== null) Vec2Ops.assertFiniteVec(at, 'paste point');
  if (stepMm !== null) Vec2Ops.assertFiniteVec(stepMm, 'paste step');
  return command({ action: 'paste', count: pieces.parts.length }, (document) => {
    const features = allFeatures(pieces.parts);
    if (
      pieces.parts.length === 0 ||
      ids.parts.length < pieces.parts.length ||
      ids.features.length < features.length ||
      ids.seams.length < pieces.seams.length
    ) {
      return document;
    }

    const renamed = new Map(features.map((f, i) => [f.id, ids.features[i]!] as const));
    const into = (ref: FeatureId): FeatureId => renamed.get(ref) ?? ref;
    const wasLocked = new Map(features.map((f) => [renamed.get(f.id)!, f.locked] as const));

    // Unlocked until placed, as a duplicate is: a lock is the finished
    // piece's, and would refuse the move that places it.
    const pasted = pieces.parts.map((part, i): Part => ({
      ...part,
      id: ids.parts[i]!,
      features: part.features.map((f) => ({
        ...repointed(f, renamed.get(f.id)!, into),
        locked: false,
      })),
    }));
    const seams = pieces.seams.map((seam, i): Seam => ({
      ...seam,
      id: ids.seams[i]!,
      a: { ...seam.a, holeSetId: into(seam.a.holeSetId) },
      b: { ...seam.b, holeSetId: into(seam.b.holeSetId) },
    }));

    const project: Project = {
      ...document.project,
      parts: [...document.project.parts, ...pasted],
      ...(seams.length === 0 ? {} : { seams: [...(document.project.seams ?? []), ...seams] }),
    };
    const partIds = new Set(pasted.map((part) => part.id));
    return { project: relock(placed(project, pasted, partIds, at, stepMm), partIds, wasLocked) };
  });
}

function placed(
  project: Project,
  pasted: readonly Part[],
  partIds: ReadonlySet<PartId>,
  at: Vec2 | null,
  stepMm: Vec2 | null,
): Project {
  if (stepMm !== null) return movePieces(project, partIds, Vec2Ops.quantiseVec(stepMm));
  if (at === null) return moveClear(project, pasted);
  const box = boxOfParts(project, partIds);
  if (box === null) return project;
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return movePieces(project, partIds, {
    x: quantise(at.x - centre.x),
    y: quantise(at.y - centre.y),
  });
}

/**
 * How far `partIds` were moved between two projects, or `null` when what
 * happened was anything but that (step and repeat, 8.8b): the pieces not
 * moved whole, by one offset, or any other piece touched. Quantised, as a move
 * is, and `null` for no move at all.
 *
 * Read from the result rather than from the command, so a drag, *Move by* and
 * a nudge are all the same to it.
 */
export function pieceStep(
  before: Project,
  after: Project,
  partIds: ReadonlySet<PartId>,
): Vec2 | null {
  const was = boxOfParts(before, partIds);
  const is = boxOfParts(after, partIds);
  if (was === null || is === null || before.parts.length !== after.parts.length) return null;

  const step = Vec2Ops.quantiseVec({ x: is.minX - was.minX, y: is.minY - was.minY });
  if (step.x === 0 && step.y === 0) return null;

  // Moved whole means exactly what moving them whole makes of them.
  const expected = movePieces(before, partIds, step).parts;
  const same = after.parts.every((part, i) => {
    const old = (partIds.has(part.id) ? expected : before.parts)[i];
    return (
      old?.id === part.id &&
      (partIds.has(part.id)
        ? JSON.stringify(old.features) === JSON.stringify(part.features)
        : old.features.length === part.features.length &&
          old.features.every((feature, k) => feature === part.features[k]))
    );
  });
  return same ? step : null;
}

/**
 * A mirror of a feature left behind, re-derived inside the copy, or `null`.
 *
 * Holes along a line (`Y`) placed along a line `Z`: when the copy holds the
 * mirror of `Z` about the same axis, the mirror of `Y` is the same holes placed
 * along the mirror of `Z` — placing holes commutes with a reflection, tangents
 * and order included.
 */
function rerootedMirror(
  feature: Feature,
  original: ReadonlyMap<FeatureId, Feature>,
  kept: ReadonlyMap<FeatureId, Feature>,
): Feature | null {
  // Only holes along a line, which have no drawn form to freeze to. An offset
  // does not commute with a reflection exactly: the offset of a mirrored
  // outline is the mirror of the stitch line, run the other way round — which
  // turns its holes about and moves where a seam starts.
  if (!isHolesAlongALine(feature.kind)) return null;
  if (feature.source.kind !== 'derived' || feature.source.op.type !== 'mirror') return null;
  if (kept.has(feature.source.sourceId)) return null;
  const axis = feature.source.op.axis;
  const glideMm = feature.source.op.glideMm;
  if (axis.kind === 'fold' && !kept.has(axis.foldId)) return null;

  const mirrored = original.get(feature.source.sourceId);
  if (mirrored?.source.kind !== 'derived' || mirrored.source.op.type === 'mirror') return null;
  const from = mirrored.source.sourceId;

  // Matched as the copy was made, not as it stands: the mirror of `Z` may be
  // frozen already, and is still exactly where its holes belong.
  for (const id of kept.keys()) {
    const candidate = original.get(id);
    const source = candidate?.source;
    if (
      candidate !== undefined &&
      source !== undefined &&
      source.kind === 'derived' &&
      source.sourceId === from &&
      source.op.type === 'mirror' &&
      approxEq(source.op.glideMm, glideMm) &&
      sameAxis(source.op.axis, axis)
    ) {
      return { ...feature, source: { ...mirrored.source, sourceId: candidate.id } } as Feature;
    }
  }
  return null;
}

function sameAxis(a: MirrorAxis, b: MirrorAxis): boolean {
  if (a.kind === 'fold') return b.kind === 'fold' && a.foldId === b.foldId;
  return (
    b.kind === 'line' &&
    Vec2Ops.equals(a.origin, b.origin) &&
    approxEq(a.angleRad, b.angleRad, EPS_ANGLE)
  );
}

function allFeatures(parts: readonly Part[]): Feature[] {
  return parts.flatMap((part) => part.features);
}

/** A piece as drawn elsewhere — an imported file's (9.20) — its paths sorted by role. */
export interface DrawnPiece {
  readonly name: string;
  readonly outline: Path;
  readonly cutOuts: readonly Path[];
  readonly stitchLines: readonly Path[];
  readonly foldLines: readonly Path[];
  readonly markings: readonly Path[];
}

/**
 * Drawn pieces made parts, as one undo step (9.20): each outline a part, with
 * its cut-outs, its stitch lines drawn as they were, its folds (valley, with
 * the maker's leather thickness, as the fold tool makes them) and its markings
 * (alignment, as an open drawn line is). Every feature is drawn geometry, so
 * the parts are sound by construction: one outer contour each, every inner
 * one closed. Into an empty project they keep their place; into one with a
 * drawing they land clear of it, as a paste does.
 */
export function importPieces(
  pieces: readonly DrawnPiece[],
  nextId: () => string,
  foldThicknessMm?: Mm,
): { command: Command; partIds: readonly PartId[] } {
  const parts = pieces.map((piece): Part => {
    const outline = pathPart(nextId() as PartId, nextId() as FeatureId, piece.name, piece.outline);
    const drawn = (path: Path) => ({ kind: 'path', path }) as const;
    const id = () => nextId() as FeatureId;
    return {
      ...outline,
      features: [
        ...outline.features,
        ...piece.cutOuts.map((p) => cutOut(id(), drawn(p))),
        ...piece.stitchLines.map((p) => drawnStitchLine(id(), drawn(p))),
        ...piece.foldLines.map((p) => foldLine(id(), drawn(p), 'valley', foldThicknessMm)),
        ...piece.markings.map((p) => markingLine(id(), drawn(p), 'alignment')),
      ],
    };
  });
  const add = command({ action: 'import', count: parts.length }, (document) => {
    if (parts.length === 0) return document;
    const project: Project = {
      ...document.project,
      parts: [...document.project.parts, ...parts],
    };
    return {
      project: document.project.parts.length === 0 ? project : moveClear(project, parts),
    };
  });
  return { command: add, partIds: parts.map((part) => part.id) };
}
