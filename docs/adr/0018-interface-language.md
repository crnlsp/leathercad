# 18. The interface's words: a catalogue per language, and no words below the app

**Status:** Accepted
**Date:** 2026-09-30

## Context

Every word LeatherCAD showed was English, written where it was shown — in React components, in the
main process's menu and dialogs — and some of it below the app entirely: the domain's problem
catalogue (`problems/messages.ts`), the export's wording of the sheet plan for Parts, the document's
undo labels, and an editor refusal that passed "An outline" to the domain as a fact. A translation
could not reach any of it without editing application code, and the layers the architecture keeps
pure were quietly one language.

The interface is to be translatable by the people who use it — Polish, German, Spanish and Russian
are the first asked for — without another rewrite, and without a contributor having to understand the
code. English stays the only language for now.

## Decision

**One catalogue per language, as JSON, in `apps/desktop/src/locales/`**, named by its BCP 47 tag:
`en.json`, `pl.json`, `pt-BR.json`. Files are found by `import.meta.glob`, so a file is a language:
nothing lists them, and Settings shows the new one.

**The format is i18next's JSON v4**, the one translation tools already read: nested keys,
`{{name}}` placeholders, and a plural as one key per CLDR form (`_one`, `_few`, `_many`, `_other`).
The app does not use i18next. The runtime is `apps/desktop/src/shared/i18n.ts`, about a hundred lines
on the platform's `Intl`:

- **Plurals** by `Intl.PluralRules` for the language, so Polish gets `few` and `many` and English
  does not have to write them.
- **Numbers** in placeholders by `Intl.NumberFormat`, **lists** by `Intl.ListFormat`, **dates** by
  `toLocaleString`, and **language names** by `Intl.DisplayNames` — each language listed in Settings
  by its own name, so a maker can find theirs whatever the window is in.
- **Fallback, key by key, to English.** A key a language lacks shows in English, never as a key.
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

**The language is a preference**, in `preferences.json` like the others (`language`: `system` or a
shipped tag), applied at once from Settings → Language. *Follow system* follows Electron's
`app.getPreferredSystemLanguages()`, read in the main process and handed to the renderer, so the two
resolve the same language. The resolved locale keeps the system's region when the system speaks
that language — English on a British system writes dates as `en-GB` does. The main process has its
own translator for macOS's menu and its dialogs, and rebuilds the menu when the language changes.

**A translation is checked by `pnpm test locales`**: every key English has, no key it lacks, the
same placeholders, and every plural form the language has, named in the failure.

## Consequences

- A contributor adds a language by adding one file and running one command; the README says how.
- `.lcp` files are unaffected: nothing in a document, in `persist` or below depends on the
  interface's language, and a project opens the same in all of them.
- **Paper keeps its own language, English.** The PDF's footer, part captions and tape-join labels,
  and the Sheets view's picture of them, are drawn by `export` and `render` from glyph outlines
  extracted for Latin (ADR 0011). Printing Cyrillic needs those outlines first; that decision, and
  whether paper should follow the interface at all, are left for when a language needs it.
- **Default names stay English**: *Untitled*, *Part 1*, *Stitch line*. They are the maker's data
  once created and are written into the file; making them follow the interface is a product decision
  of its own.
- **Numbers keep the house format**: a decimal point, a true minus (`−3.85 mm`). Fields already accept
  a decimal comma. Writing a comma where the language does needs the fields, the readouts and the
  canvas to change together, and is not done here.
- A string with markup inside it is split around a `{{placeholder}}` the component fills — the
  sample link in Parts, the invitation in Settings — rather than carrying HTML in a translation.
- The check fails on a missing key. That is right for a new language; when English grows a key and
  other languages exist, the change that adds it will fail until they have it too, or until this
  check is relaxed to report missing keys instead. That is decided with the second language.
- An audit test (`renderer/src/untranslated.test.ts`) parses the renderer's JSX and fails on words
  written into it, so the catalogue stays the only place the interface's words are.
