import { createContext, useContext } from 'react';

import { SOURCE_LOCALE, createI18n, type I18n } from '../../shared/i18n.js';

const I18nContext = createContext<I18n>(createI18n(SOURCE_LOCALE));

/** Gives the window its language: the app's root, which owns the preference. */
export const I18nProvider = I18nContext.Provider;

/**
 * The interface's words, in the maker's language (ADR 0018). A component that
 * asks re-renders when the language changes, so a change in Settings applies
 * at once, everywhere.
 */
export function useI18n(): I18n {
  return useContext(I18nContext);
}
