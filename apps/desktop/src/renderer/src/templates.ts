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
}[] = [
  {
    id: 'bifold-wallet',
    name: 'templates.bifoldWallet.name',
    description: 'templates.bifoldWallet.description',
  },
  {
    id: 'card-holder',
    name: 'templates.cardHolder.name',
    description: 'templates.cardHolder.description',
  },
  { id: 'key-fob', name: 'templates.keyFob.name', description: 'templates.keyFob.description' },
  { id: 'coaster', name: 'templates.coaster.name', description: 'templates.coaster.description' },
];
