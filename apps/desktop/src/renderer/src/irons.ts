import { EPS_LENGTH, approxEq, approxLte, formatEditable } from '@leathercad/core';
import { toothOfStyle, type Derivation, type Tooth } from '@leathercad/domain';
import type { Iron, Preferences } from '@leathercad/platform';

import { type Refusal, type RefusalWords } from './outlineSizes.js';

/**
 * Pricking irons, by the pitch stamped on them — the maker's own, from
 * Settings › My tools (U.13).
 *
 * Application configuration, not document data. A hole set stores the pitch
 * **value** and the iron's name, so a file opens identically on a machine that
 * has never heard of these irons; the name rides along only so the panel can
 * say what was chosen.
 *
 * Pitch is nominal — the spacing actually achieved on a given outline is
 * derived and reported separately. See docs/glossary.md.
 */
export type MakerTools = Pick<
  Preferences,
  'irons' | 'defaultIronId' | 'stitchMarginMm' | 'leatherThicknessMm' | 'pocketEaseMm'
>;

/** The stitch margin's floor and step, wherever it is typed: Settings › My tools, and Properties while drawing (U.18). */
export const MARGIN_MIN_MM = 0.5;
export const MARGIN_STEP_MM = 0.5;

/** The maker's iron a hole set was made with — its name and its pitch — if they still have it. */
export function ironOf(
  irons: readonly Iron[],
  pitchMm: number,
  name: string | undefined,
): Iron | undefined {
  return irons.find((iron) => iron.name === name && approxEq(iron.pitchMm, pitchMm, EPS_LENGTH));
}

/** The iron a new hole set takes, if the maker has one. */
export function defaultIron(tools: MakerTools): Iron | undefined {
  return tools.irons.find((iron) => iron.id === tools.defaultIronId);
}

/** The list without one iron; the default moves to the first left if it was that one. */
export function withoutIron(
  tools: MakerTools,
  id: string,
): Pick<MakerTools, 'irons' | 'defaultIronId'> {
  const irons = tools.irons.filter((iron) => iron.id !== id);
  const kept = irons.some((iron) => iron.id === tools.defaultIronId);
  return { irons, defaultIronId: kept ? tools.defaultIronId : (irons[0]?.id ?? null) };
}

type HolesOp = Extract<Derivation, { type: 'stitch-holes' }>;

/** The tooth a hole set made with this iron takes (9.26): its style's, at its pitch. */
export function toothOfIron(iron: Iron): Tooth {
  return toothOfStyle(iron.style ?? 'french', iron.pitchMm);
}

/** What the Iron menu writes when the maker picks an iron: its pitch, its tooth and its name, together. */
export function withIron(op: HolesOp, iron: Iron): HolesOp {
  return { ...op, pitchMm: iron.pitchMm, tooth: toothOfIron(iron), ironLabel: iron.name };
}

/**
 * The tooth Properties shows: the set's own, or — where the iron was not said
 * (D26) — the French slit the board draws for it.
 */
export function shownTooth(op: HolesOp): Tooth {
  return op.tooth ?? toothOfStyle('french', op.pitchMm);
}

/**
 * A typed tooth (9.26). Like a typed pitch, it is no longer that iron's, so
 * the iron's name goes with it rather than lying about where it came from.
 */
export function withTypedTooth(op: HolesOp, tooth: Tooth): HolesOp {
  const { ironLabel: _dropped, ...rest } = op;
  return { ...rest, tooth };
}

/**
 * A slit longer than the pitch, which would run into the next hole on a
 * straight line: refused, as evaluation refuses it, offering the pitch.
 */
export function slitRefusal(
  lengthMm: number,
  pitchMm: number,
  { t, enter }: RefusalWords,
): Refusal | null {
  if (approxLte(lengthMm, pitchMm, EPS_LENGTH)) return null;
  const size = formatEditable(pitchMm, 2);
  return { reason: t('editor.tooth.longerThanPitch', { size, enter }), use: pitchMm };
}
