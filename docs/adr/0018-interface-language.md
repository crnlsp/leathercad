# 18. The interface's words: a catalogue per language, and no words below the app

**Status:** Accepted
**Date:** 2026-09-30
**Amended:** 2026-11-04 — U.26: production languages and non-blocking coverage

## Context

Every word LeatherCAD showed was English, written where it was shown — in React components, in the
main process's menu and dialogs — and some of it below the app entirely: the domain's problem
catalogue (`problems/messages.ts`), the export's wording of the sheet plan for Parts, the document's
undo labels, and an editor refusal that passed "An outline" to the domain as a fact. A translation
could not reach any of it without editing application code, and the layers the architecture keeps
pure were quietly one language.

The interface is to be translatable by the people who use it — Polish, German, Spanish and Russian
are the first asked for — without another rewrite, and without a contributor having to understand the
code. U.26 registers English, Polish, German and Russian for production.

## Decision

**One catalogue per language, as JSON, in `apps/desktop/src/locales/`**, named by its BCP 47 tag:
`en.json`, `pl.json`, `pt-BR.json`. `en.json` is the source: every key exists in it.

**A translation is not a supported language.** The languages LeatherCAD offers are a registry the
project owns, `SUPPORTED_LANGUAGES` in `shared/i18n.ts`: each entry a tag, the language's name in
itself as Settings lists it, and its file, imported by name. Only those are offered in Settings,
followed by *Follow system*, accepted in `preferences.json`, and carried by a release. A file with
no entry is a translation in progress: it can be contributed, merged and kept up with English on its
own, and becomes a language only when a maintainer has reviewed it and adds it — so terminology
and language registration are the project's call, not a file's. Registration does
not depend on completeness: missing translations never remove a registered language. A development build
(`pnpm dev`) also lists every file not in the registry, marked *preview, not yet supported*, so a
translator can try theirs in the app; a production build leaves them out entirely — it neither lists
nor bundles them.

**The format is i18next's JSON v4**, the one translation tools already read: nested keys,
`{{name}}` placeholders, and a plural as one key per CLDR form (`_one`, `_few`, `_many`, `_other`).
The app does not use i18next. The runtime is `apps/desktop/src/shared/i18n.ts`, using the
platform's `Intl`:

- **Plurals** by `Intl.PluralRules` for the language, so Polish gets `few` and `many` and English
  does not have to write them.
- **Numbers** in placeholders by `Intl.NumberFormat`, **lists** by `Intl.ListFormat`, **dates** by
  `toLocaleString`, and **language names** by `Intl.DisplayNames` — each language listed in Settings
  by its own name, so a maker can find theirs whatever the window is in.
- **Fallback, key by key, to English.** A key a language lacks shows in English, never as a key.
  English is always there: it is the first entry of the registry, and cannot be left out of it.
  A plural family falls back as a whole, using **English plural rules**. An incomplete translated
  family also falls back as a whole at runtime; validation rejects it. Never mix a translated
  `_other` with an English `_one`, or select English singular using Russian rules for 21.
  Placeholder numbers continue to use the selected interface locale even in fallback text.
- **Language names from the registry.** A supported language is listed by the name its entry
  gives; `Intl.DisplayNames` supplies only its name in the interface's language (`Polski —
  Polish`), and a preview's name, which has no entry to come from.
- **Typed keys.** `MessageKey` is derived from `en.json`: a key that does not exist does not compile,
  and a table typed over ids — problem codes, tool ids, undo actions — fails to compile when an id
  has no words.

**Only the app speaks a language.** Everything below `apps/desktop` reports facts, and the app words
them:

| What | Was | Now |
|---|---|---|
| Problems | `domain/problems/messages.ts` | `renderer/src/problemText.ts`, words under `problems.<CODE>` |
| The loader's refusal | a sentence from the catalogue | `InvalidProjectFileError.problems`, worded by the app |
| Parts' and the Sheets view's paper wording | `describePrintStatus`, `describeSheets`, … in export | `renderer/src/sheetWords.ts` |
| Undo labels | English in `document` | `HistoryLabel` — an action and the name or count it needs |
| A drawing refusal's subject | "An outline" as a fact | `drawing: 'outline' \| 'seam' \| 'cut-out'` |
| A piece's caption on the board (U.2) | `describePart`, `describeStitching` in render | `renderer/src/captionWords.ts` from `stitchingOf`, words under `caption.*` |

**The language is a preference**, in `preferences.json` like the others (`language`: `system` or a
supported tag), applied at once from Settings → Language. *Follow system* follows Electron's
`app.getPreferredSystemLanguages()`, read in the main process and handed to the renderer, so the two
resolve the same language. The resolved locale keeps the system's region when the system speaks
that language — English on a British system writes dates as `en-GB` does. The main process has its
own translator for macOS's menu and its dialogs, and rebuilds the menu when the language changes.

**English is the single source of truth.** Feature pull requests need only update `en.json`;
updates to other languages are optional and may arrive separately. Every locale, including a
registered production locale, may omit a whole message or plural family. Missing translations use
English and never block ordinary pull requests or releases.

**Structural integrity stays blocking.** `pnpm test locales` checks every file, registered or not,
using `shared/catalogue.ts`: valid JSON, known keys and groups, nonempty strings, valid tags,
matching placeholders and complete CLDR families where a plural is translated. Polish and Russian
families require `_one`, `_few`, `_many`, `_other`; German and English require `_one`, `_other`.
`count` may be implicit in a plural form, as in “one hole”; other placeholders must be retained.
Missing entire messages are tested as valid. The registry must still name real, valid catalogues.

**Coverage is informational.** `pnpm locales:report` uses the same structural validator, counts a
plural family once and lists missing message keys and structural errors. Exact English copies are
reported as untranslated, even for shared words, keycaps, acronyms and placeholder-only labels;
these conservative figures are not a release gate. `pnpm locales:report --review pl` produces a
side-by-side Markdown table for review. See [the translation guide](../localization.md).

**Development overflow preview.** In addition to unregistered files, `pnpm dev` offers
*English (expanded)* (`en-XA`), with words lengthened by about 40 % and placeholders preserved.
It is generated from English, is not a supported preference in production and is removed from
production bundles. Production explicitly imports all four supported catalogues.

## Consequences

- A contributor adds a translation by adding one file, running one command and trying it in
  `pnpm dev`; the README says how. Making it a supported language is one registry entry, by a
  maintainer, after review — the only code a language ever needs.
- `.lcp` files are unaffected: nothing in a document, in `persist` or below depends on the
  interface's language, and a project opens the same in all of them.
- **Paper keeps its own language, English.** The PDF's footer, part captions and tape-join labels,
  and the Sheets view's picture of them, are drawn by `export` and `render` from glyph outlines
  extracted for Latin (ADR 0011). Printing Cyrillic needs those outlines first; that decision, and
  whether paper should follow the interface at all, are left for when a language needs it. *Since
  U.2 (1.5):* the Design board's own captions — "Card pocket ×2" over "52 holes · 3.85 mm" — are
  screen text and the interface's words; only paper still says "Card pocket — cut 2" in English.
- **Data names and filename defaults stay English**: *Untitled.lcp*, *Part 1*, *Stitch line*.
  They can become the maker's saved data, so the save dialog's unnamed-file suggestion explicitly
  uses English. Since 8.12, an unnamed project starts with an empty name: its tab displays a
  translated *Untitled* placeholder, and the first save takes its name from the chosen filename.
  That interface placeholder is not written into the document by changing language.
- **Numbers keep the house format**: a decimal point, a true minus (`−3.85 mm`). Fields already accept
  a decimal comma. Writing a comma where the language does needs the fields, the readouts and the
  canvas to change together, and is not done here.
- A string with markup inside it is split around a `{{placeholder}}` the component fills — the
  sample link in Parts, the invitation in Settings — rather than carrying HTML in a translation.
- English-only feature work stays independent of translation work. Missing translations show
  English; structural mistakes still fail. Native-speaker corrections and terminology improvements
  are welcome in separate pull requests.
- An audit test (`renderer/src/untranslated.test.ts`) parses the renderer's JSX and fails on words
  written into it, so the catalogue stays the only place the interface's words are.
