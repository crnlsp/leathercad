# Translating LeatherCAD

English (`apps/desktop/src/locales/en.json`) is the single source of truth. Feature PRs need only
update English. Updating Polish, German, Russian or French in the same PR is optional;
translations can follow separately. Missing translations use English. Coverage is informational and never a
development or release blocker. Structural integrity is mandatory.

The implementation and boundaries are in [ADR 0018](adr/0018-interface-language.md). No translation
service or new dependency is needed to contribute.

## Workflow

1. Edit `pl.json`, `de.json`, `ru.json` or `fr.json`, preserving nesting and keys. New languages
   use a BCP 47 filename. Do not add metadata to a catalogue: every leaf is a UI message.
   When an English key is removed or renamed, remove obsolete translation keys too; adding a
   replacement translation remains optional.
2. Keep `{{placeholders}}`, including their spelling. Translate surrounding words, never IDs,
   diagnostic codes, file extensions, units, keyboard bindings or saved project data. A plural's
   count can be implicit in a phrase such as “one hole”; preserve every other placeholder.
3. Translate a whole logical message. A plural needs every category from `Intl.PluralRules`:
   English/German: `_one`, `_other`; Polish/Russian: `_one`, `_few`, `_many`, `_other`.
   French: `_one`, `_many`, `_other`. French `one` includes 0 and fractions below 2;
   `many` includes exact integer multiples of one million, with wording such as “de trous”.
   Never assume a language has English's categories. The report prints the runtime's required
   forms; check the actual locale with `new Intl.PluralRules(tag).resolvedOptions().pluralCategories`.
   Missing a whole family is allowed; an incomplete family fails validation. `_other` includes
   fractions, not a substitute for Polish/Russian integer forms.
4. Run `pnpm test locales i18n untranslated`. Unknown keys/groups, invalid JSON, empty/non-string
   values, placeholder mistakes and malformed plurals fail. Missing messages pass for all locales.
5. Run `pnpm locales:report` to see total, translated, missing, percentage, missing logical keys
   and structural errors for every catalogue. English copies are conservatively uncounted,
   including shared words such as German *Name*, keycaps, symbols and placeholder-only labels.
   Changing only whitespace, including French nonbreaking spaces, does not count as translation.
   The report exits successfully even for structural findings; the tests remain the blocking check.
6. Review strings side by side, for example:

   ```bash
   pnpm locales:report --review pl > /tmp/leathercad-polish-review.md
   ```

   This lists all forms, using English `_other` as context for `_few` and `_many`. Each catalogue
   can be reviewed in any language this way, for example `pnpm locales:report --review fr`.
   English singular is context only: it does not imply that the target's `one` means exactly 1.
   Polish is awaiting the maintainer's personal review; no human review is claimed.
7. Try `pnpm dev` and Settings → Language. Registered languages ship even if coverage later drops;
   unregistered files are development previews. *English (expanded)* lengthens words about 40 %
   for overflow testing and is absent in production. Check 860 × 600 and a normal desktop window.
8. Open a separate translation PR into `develop`. Native-speaker corrections and better domain
   terminology are welcome. Describe any context-sensitive decisions.

To register another production language, import its catalogue and add its own-language name to
`SUPPORTED_LANGUAGES` in `shared/i18n.ts`. Extend the production-registration assertion in
`shared/i18n.test.ts`, and the catalogue/locale list in `e2e/localization.spec.ts`; its existing
scenarios then cover switching, persistence, system detection, data round trips and both window
sizes. Check all required plural categories, zero, fractions and large counts. Update the language
list, terminology and provenance below. Registration has no coverage-percentage threshold.

## Voice and UI wording

Use sentence case, short action labels and natural technical language. English uses British
spelling (*centre*, *millimetres*). German uses standard German for Germany; explanatory sentences
use polite *Sie*, and action labels use infinitives. Polish and Russian instructions use a
consistent singular imperative. Match the source's warning severity and negation. Destructive
actions say what is lost; preserve distinctions between removing a list entry, deleting work and
moving a file to the system trash.

French uses standard French for France, infinitives for actions and polite *vous* in instructions.
Use nonbreaking spaces inside « guillemets » and before `: ; ! ? %`. Keep nominal *pas* (the griffe's
*entraxe*) distinct from achieved *espacement réel*, and *patron* distinct from reusable *modèle*.
Displayed special keys use conventional French names such as *Maj*, *Entrée*, *Échap* and *Suppr*;
their binding identifiers and actual key events stay unchanged.

Use `…` on menu commands opening another choice or dialog. Do not add ellipses to tool names or
navigation labels simply because they change a view. Preserve technical acronyms and units such
as PDF, SVG, DXF and mm. Keyboard keycaps generally keep the physical key label; translate actions
such as dragging and scrolling. Do not force distinct English concepts into a single translated
term just to shorten a control. Fix the layout if reasonable wording does not fit.

## Canonical terminology

The [glossary](glossary.md) defines the concepts; this table supplies the translation vocabulary.
Inflections and context may change the form, not the concept.

| English | Polish | German | Russian | French |
|---|---|---|---|---|
| Project | Projekt | Projekt | Проект | Projet |
| Part / physical piece | Część | Teil | Деталь | Pièce |
| Pattern | Wykrój | Schnittmuster | Выкройка | Patron |
| Template, reusable starting project | Szablon | Vorlage | Шаблон | Modèle |
| Feature | Element | Element | Элемент | Élément |
| Outline, outer cut contour | Obrys | Umriss | Внешний контур | Contour extérieur |
| Cut-out, inner contour | Wycięcie | Ausschnitt | Вырез | Découpe intérieure |
| Stitch line | Linia szycia | Nahtlinie | Линия строчки | Ligne de couture |
| Seam, mating runs sewn together | Szew | Naht | Шов | Couture |
| Seam allowance | Zapas na szew | Nahtzugabe | Припуск на шов | Marge de couture |
| Stitch margin | Margines szycia | Nahtabstand zum Rand | Отступ строчки от края | Retrait de couture |
| Pricking iron | Wybijak | Prickeisen | Строчный пробойник | Griffe à frapper |
| Pitch, nominal tooth distance | Rozstaw nominalny | Nennabstand | Номинальный шаг | Pas nominal (entraxe) |
| Spacing, achieved hole distance | Rozstaw rzeczywisty | Istabstand | Фактический шаг | Espacement réel |
| Stitch hole | Otwór do szycia | Nahtloch | Отверстие под строчку | Trou de couture |
| Hardware hole | Otwór pod okucie | Beschlagloch | Отверстие под фурнитуру | Trou de quincaillerie |
| Row of holes, along marking line | Rząd otworów | Lochreihe | Ряд отверстий | Rangée de trous |
| Fold line | Linia zgięcia | Falzlinie | Линия сгиба | Ligne de pli |
| Marking line | Linia oznaczenia | Markierungslinie | Линия разметки | Ligne de marquage |
| Skive, thin the leather | Ścienianie skóry | Schärfen | Спуск кожи | Parage |
| Construction guide | Prowadnica | Hilfslinie | Направляющая | Guide |
| Alignment mark, on leather | Znak dopasowania | Ausrichtungsmarkierung | Метка совмещения | Repère d’alignement |
| Registration mark, paper joining | Znak pasowania | Passermarke | Метка совмещения листов | Repère d’assemblage |
| Sheet, physical paper | Arkusz | Bogen | Лист | Feuille |
| Flip, reflect in place, no link | Odwróć | Spiegeln | Отразить | Retourner |
| Mirror, linked counterpart | Odbicie powiązane | Verknüpft spiegeln | Связанное отражение | Symétrie liée |
| Duplicate, independent copy | Powiel | Duplizieren | Дублировать | Dupliquer |
| Copy, clipboard | Kopiuj | Kopieren | Копировать | Copier |
| Save, editable project | Zapisz | Speichern | Сохранить | Enregistrer |
| Export, another output format | Eksportuj | Exportieren | Экспортировать | Exporter |
| Problems, diagnostic list | Problemy | Probleme | Проблемы | Problèmes |
| Error / warning / information | Błąd / ostrzeżenie / informacja | Fehler / Warnung / Hinweis | Ошибка / предупреждение / примечание | Erreur / avertissement / information |

*Part* and *piece* both refer to a physical leather component; English retains *Parts* as the
panel/domain name and *piece* in craft instructions. *Pattern* is the design; *template* is a
reusable starting project. *Cut contour* is the geometric category; *outline* and *cut-out* are
its outer and inner roles. *Holes* is adequate when the surrounding control already establishes
stitching; hardware holes and rows of holes remain distinct. *Move* is the action and *position*
is a coordinate; the mathematical term *translate* does not replace either in UI copy.

## Provenance and review

German, Russian and French were prepared with AI assistance and may benefit from further native-speaker
review. Russian incorporates F1ystar's work from [PR #87](https://github.com/crnlsp/leathercad/pull/87),
head `27b72f5df653ee9056618b68cac52514f7a80b71`. Compatible translations were reused; newer
messages, changed behavior and plural families were reconciled against current English. The
review's missing `_few`/`_many` and production-registration findings are addressed here. This is
not an entirely new Russian translation, nor a claim of native-language approval.

Polish is prepared for the maintainer's personal review. Use the review command above to inspect
every string. Actual checks and limitations are recorded in
[localization-verification.md](localization-verification.md).
