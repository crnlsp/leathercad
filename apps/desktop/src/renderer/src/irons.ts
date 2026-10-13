import { EPS_LENGTH, approxEq } from '@leathercad/core';
import type { Iron, Preferences } from '@leathercad/platform';

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
  'irons' | 'defaultIronId' | 'stitchMarginMm' | 'leatherThicknessMm'
>;

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
