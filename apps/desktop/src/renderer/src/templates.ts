import type { MessageKey } from '../../shared/i18n.js';

/**
 * The templates that ship with the app (8.12), in the order the picker lists
 * them: the sample wallet first, then the smaller pieces. Each is a `.lcp` the
 * main process reads by its id; its words are the catalogue's.
 */
export const BUILT_IN_TEMPLATES: readonly {
  readonly id: string;
  readonly name: MessageKey;
  readonly description: MessageKey;
  /** What kind of goods it is, for the picker's filter (8.14). */
  readonly category: TemplateCategory;
}[] = [
  {
    id: 'bifold-wallet',
    name: 'templates.bifoldWallet.name',
    description: 'templates.bifoldWallet.description',
    category: 'wallets',
  },
  {
    id: 'card-holder',
    name: 'templates.cardHolder.name',
    description: 'templates.cardHolder.description',
    category: 'wallets',
  },
  {
    id: 'key-fob',
    name: 'templates.keyFob.name',
    description: 'templates.keyFob.description',
    category: 'small',
  },
  {
    id: 'coaster',
    name: 'templates.coaster.name',
    description: 'templates.coaster.description',
    category: 'small',
  },
];

/** The kinds of goods the built-in templates are (8.14); each is `templates.category.<id>`. */
export type TemplateCategory = 'wallets' | 'small';

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ['wallets', 'small'];
