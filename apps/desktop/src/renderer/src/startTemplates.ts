import type { Project } from '@leathercad/domain';
import type { TemplateEntry } from '@leathercad/platform';

import type { Translate } from '../../shared/i18n.js';
import type { TemplateChoice } from './TemplateDialog.js';
import { BUILT_IN_TEMPLATES } from './templates.js';

/** The template cards beside the blank project (U.23): two rows of four with it. */
export const START_CARDS = 7;

/** A template that loaded, so it can be drawn on its card and started from. */
export interface LoadedTemplate extends TemplateChoice {
  readonly project: Project;
}

const loaded = (choice: TemplateChoice): choice is LoadedTemplate => choice.project !== null;

/** Used later first; never used after every one that was. */
const byUse = (a: TemplateEntry, b: TemplateEntry): number =>
  a.usedAt === b.usedAt ? 0 : a.usedAt === null ? 1 : b.usedAt === null ? -1 : b.usedAt - a.usedAt;

/**
 * The templates the start screen offers as cards (U.23): the ones that load,
 * the pinned first, then the last used, then the library's own order — the
 * built-in ones as the picker lists them, then the maker's. The rest are a
 * press away, in the picker.
 */
export function startTemplates(templates: readonly TemplateChoice[]): readonly LoadedTemplate[] {
  // `sort` is stable, so equal ones keep the library's order.
  return templates
    .filter(loaded)
    .sort((a, b) => Number(b.entry.pinned) - Number(a.entry.pinned) || byUse(a.entry, b.entry))
    .slice(0, START_CARDS);
}

/** A template's name as the maker reads it: a built-in one's from the catalogue. */
export function templateName(entry: TemplateEntry, t: Translate): string {
  const built = BUILT_IN_TEMPLATES.find((each) => `builtin:${each.id}` === entry.id);
  return built === undefined ? entry.name : t(built.name);
}
